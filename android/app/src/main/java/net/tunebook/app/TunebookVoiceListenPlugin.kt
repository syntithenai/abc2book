package net.tunebook.app

import android.Manifest
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import java.util.Locale

/**
 * On-device speech recognition via Android [SpeechRecognizer].
 *
 * Prefers Google's recognition service when installed. On some OEMs (e.g. Lenovo)
 * the default service is Pixel AiAi / Private Compute, which often fails.
 */
@CapacitorPlugin(
    name = "TunebookVoiceListen",
    permissions = [
        Permission(
            strings = [Manifest.permission.RECORD_AUDIO],
            alias = "microphone",
        ),
    ],
)
class TunebookVoiceListenPlugin : Plugin() {
    companion object {
        private const val TAG = "TunebookVoiceListen"

        private val PREFERRED_RECOGNIZERS = listOf(
            ComponentName(
                "com.google.android.googlequicksearchbox",
                "com.google.android.voicesearch.serviceapi.GoogleRecognitionService",
            ),
        )
        // TTS recognition exists on this OEM but is a poor general STT engine — last resort only.
        private val FALLBACK_RECOGNIZERS = listOf(
            ComponentName(
                "com.google.android.tts",
                "com.google.android.apps.speech.tts.googletts.service.GoogleTTSRecognitionService",
            ),
        )
    }

    private var recognizer: SpeechRecognizer? = null
    private var activeCall: PluginCall? = null
    private val mainHandler = Handler(Looper.getMainLooper())
    private var maxTimeoutRunnable: Runnable? = null
    private var preferOfflineAttempt = false
    private var networkRetryUsed = false
    private var busyRetryUsed = false
    private var recognizerComponent: String = "default"

    @PluginMethod
    fun ensurePermissions(call: PluginCall) {
        if (getPermissionState("microphone") != com.getcapacitor.PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "micPermCallback")
            return
        }
        val out = JSObject()
        out.put("granted", true)
        call.resolve(out)
    }

    @PermissionCallback
    private fun micPermCallback(call: PluginCall) {
        val granted =
            getPermissionState("microphone") == com.getcapacitor.PermissionState.GRANTED
        val out = JSObject()
        out.put("granted", granted)
        if (granted) call.resolve(out) else call.reject("Microphone permission denied")
    }

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val available = SpeechRecognizer.isRecognitionAvailable(context)
        Log.i(TAG, "isAvailable=$available preferred=${resolvePreferredComponent()}")
        val out = JSObject()
        out.put("available", available)
        out.put("recognizer", resolvePreferredComponent()?.flattenToString() ?: "default")
        call.resolve(out)
    }

    @PluginMethod
    fun listen(call: PluginCall) {
        if (getPermissionState("microphone") != com.getcapacitor.PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "micPermThenListen")
            return
        }
        networkRetryUsed = false
        busyRetryUsed = false
        startListening(call, preferOffline = shouldPreferOffline())
    }

    @PermissionCallback
    private fun micPermThenListen(call: PluginCall) {
        if (getPermissionState("microphone") != com.getcapacitor.PermissionState.GRANTED) {
            call.reject("Microphone permission denied")
            return
        }
        networkRetryUsed = false
        busyRetryUsed = false
        startListening(call, preferOffline = shouldPreferOffline())
    }

    @PluginMethod
    fun cancel(call: PluginCall) {
        mainHandler.post {
            tearDown(cancelActive = true)
            call.resolve()
        }
    }

    /** Soft stop: end utterance and wait for [RecognitionListener.onResults]. */
    @PluginMethod
    fun stop(call: PluginCall) {
        mainHandler.post {
            try {
                recognizer?.stopListening()
            } catch (_: Exception) {
            }
            call.resolve()
        }
    }

    private fun shouldPreferOffline(): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                if (SpeechRecognizer.isOnDeviceRecognitionAvailable(context)) {
                    return true
                }
            } catch (_: Exception) {
            }
        }
        return false
    }

    private fun resolvePreferredComponent(): ComponentName? {
        val pm = context.packageManager
        for (cn in PREFERRED_RECOGNIZERS) {
            try {
                if (Build.VERSION.SDK_INT >= 33) {
                    pm.getServiceInfo(cn, PackageManager.ComponentInfoFlags.of(0))
                } else {
                    @Suppress("DEPRECATION")
                    pm.getServiceInfo(cn, 0)
                }
                return cn
            } catch (_: Exception) {
            }
        }
        try {
            val intent = Intent("android.speech.RecognitionService")
            @Suppress("DEPRECATION")
            val services = pm.queryIntentServices(intent, 0) ?: emptyList()
            for (ri in services) {
                Log.i(
                    TAG,
                    "visible recognizer: ${ri.serviceInfo?.packageName}/${ri.serviceInfo?.name}",
                )
            }
            val ranked = services.sortedBy { ri ->
                val pkg = ri.serviceInfo?.packageName ?: ""
                when {
                    pkg == "com.google.android.googlequicksearchbox" -> 0
                    pkg.contains("google") && pkg != "com.google.android.tts" && pkg != "com.google.android.as" -> 1
                    pkg == "com.google.android.tts" -> 3
                    pkg == "com.google.android.as" -> 4
                    else -> 2
                }
            }
            val best = ranked.firstOrNull()?.serviceInfo
            if (best != null) {
                return ComponentName(best.packageName, best.name)
            }
        } catch (e: Exception) {
            Log.w(TAG, "queryIntentServices failed: ${e.message}")
        }
        return null
    }

    private fun createRecognizer(): SpeechRecognizer {
        val tried = linkedSetOf<ComponentName>()
        val candidates = mutableListOf<ComponentName>()
        candidates.addAll(PREFERRED_RECOGNIZERS)
        resolvePreferredComponent()?.let { preferred ->
            if (preferred.packageName != "com.google.android.tts"
                && preferred.packageName != "com.google.android.as"
            ) {
                candidates.add(0, preferred)
            }
        }
        candidates.addAll(FALLBACK_RECOGNIZERS)

        for (cn in candidates) {
            if (!tried.add(cn)) continue
            try {
                val sr = SpeechRecognizer.createSpeechRecognizer(context, cn)
                recognizerComponent = cn.flattenToString()
                Log.i(TAG, "createRecognizer using $recognizerComponent")
                return sr
            } catch (e: Exception) {
                Log.w(TAG, "createRecognizer failed for ${cn.flattenToString()}: ${e.message}")
            }
        }
        recognizerComponent = "default"
        Log.i(TAG, "createRecognizer using default (OEM/AiAi — may be unreliable)")
        return SpeechRecognizer.createSpeechRecognizer(context)
    }

    private fun startListening(call: PluginCall, preferOffline: Boolean) {
        mainHandler.post {
            if (!SpeechRecognizer.isRecognitionAvailable(context)) {
                call.reject("Speech recognition unavailable on this device")
                return@post
            }
            tearDown(cancelActive = false)
            call.setKeepAlive(true)
            activeCall = call

            val localeTag = call.getString("locale")?.takeIf { it.isNotBlank() }
            val maxMs = (call.getInt("maxMs") ?: 8_000).coerceIn(2_000, 15_000)

            val sr = createRecognizer()
            // EXTRA_PREFER_OFFLINE is only safe for true on-device engines. On this
            // Lenovo, isOnDeviceRecognitionAvailable reflects Pixel AiAi, but we
            // bind Google Search — forcing offline there fails when the pack is
            // missing. Never prefer-offline for the Google Search service.
            val usePreferOffline =
                preferOffline
                    && !recognizerComponent.contains("googlequicksearchbox")
                    && !recognizerComponent.contains("GoogleRecognitionService")
            preferOfflineAttempt = usePreferOffline
            recognizer = sr

            val intent =
                Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                    putExtra(
                        RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                        RecognizerIntent.LANGUAGE_MODEL_FREE_FORM,
                    )
                    putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                    putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
                    putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, context.packageName)
                    if (usePreferOffline) {
                        putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
                    }
                    if (localeTag != null) {
                        putExtra(RecognizerIntent.EXTRA_LANGUAGE, localeTag)
                    } else {
                        putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault().toLanguageTag())
                    }
                }

            sr.setRecognitionListener(
                object : RecognitionListener {
                    override fun onReadyForSpeech(params: Bundle?) {
                        Log.i(TAG, "onReadyForSpeech via $recognizerComponent")
                        notifyPhase("listening")
                    }

                    override fun onBeginningOfSpeech() {
                        notifyPhase("speech")
                    }

                    override fun onRmsChanged(rmsdB: Float) {
                        val js = JSObject()
                        js.put("rmsdB", rmsdB.toDouble())
                        notifyListeners("rms", js)
                    }

                    override fun onBufferReceived(buffer: ByteArray?) {}

                    override fun onEndOfSpeech() {
                        notifyPhase("processing")
                    }

                    override fun onError(error: Int) {
                        Log.w(
                            TAG,
                            "onError code=$error preferOffline=$preferOfflineAttempt component=$recognizerComponent",
                        )
                        val isNetwork =
                            error == SpeechRecognizer.ERROR_NETWORK
                                || error == SpeechRecognizer.ERROR_NETWORK_TIMEOUT
                        if (isNetwork && preferOfflineAttempt && !networkRetryUsed) {
                            networkRetryUsed = true
                            startListening(call, preferOffline = false)
                            return
                        }
                        if (
                            (error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY
                                || error == SpeechRecognizer.ERROR_CLIENT)
                            && !busyRetryUsed
                        ) {
                            busyRetryUsed = true
                            mainHandler.postDelayed({
                                if (activeCall === call) {
                                    startListening(call, preferOffline = false)
                                }
                            }, 350)
                            return
                        }
                        val msg =
                            when (error) {
                                SpeechRecognizer.ERROR_NO_MATCH -> "no_match"
                                SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "timeout"
                                SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "permission"
                                SpeechRecognizer.ERROR_NETWORK,
                                SpeechRecognizer.ERROR_NETWORK_TIMEOUT,
                                -> "network"
                                SpeechRecognizer.ERROR_CLIENT -> "cancelled"
                                SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "busy"
                                SpeechRecognizer.ERROR_AUDIO -> "audio"
                                SpeechRecognizer.ERROR_SERVER -> "server"
                                else -> "error_$error"
                            }
                        finishReject(msg)
                    }

                    override fun onResults(results: Bundle?) {
                        val texts =
                            results
                                ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                                ?: arrayListOf()
                        val transcript = texts.firstOrNull()?.trim().orEmpty()
                        val scores = results?.getFloatArray(SpeechRecognizer.CONFIDENCE_SCORES)
                        val raw =
                            if (scores != null && scores.isNotEmpty()) scores[0].toDouble() else null
                        val confidence = if (raw != null && raw >= 0.0) raw else null
                        Log.i(
                            TAG,
                            "onResults len=${transcript.length} confidence=$confidence component=$recognizerComponent text=${transcript.take(80)}",
                        )
                        finishResolve(transcript, partial = false, confidence = confidence)
                    }

                    override fun onPartialResults(partialResults: Bundle?) {
                        val texts =
                            partialResults
                                ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                                ?: return
                        val partial = texts.firstOrNull()?.trim().orEmpty()
                        if (partial.isEmpty()) return
                        val js = JSObject()
                        js.put("transcript", partial)
                        js.put("partial", true)
                        notifyListeners("partial", js)
                    }

                    override fun onEvent(eventType: Int, params: Bundle?) {}
                },
            )

            clearMaxTimeout()
            maxTimeoutRunnable =
                Runnable {
                    if (activeCall === call) {
                        try {
                            sr.stopListening()
                        } catch (_: Exception) {
                        }
                        mainHandler.postDelayed({
                            if (activeCall === call) {
                                finishResolve("", partial = false, confidence = null)
                            }
                        }, 600)
                    }
                }
            mainHandler.postDelayed(maxTimeoutRunnable!!, maxMs.toLong())

            try {
                Log.i(
                    TAG,
                    "startListening preferOffline=$preferOffline locale=${localeTag ?: "default"} component=$recognizerComponent",
                )
                sr.startListening(intent)
            } catch (e: Exception) {
                finishReject(e.message ?: "startListening failed")
            }
        }
    }

    private fun notifyPhase(phase: String) {
        val js = JSObject()
        js.put("phase", phase)
        notifyListeners("phase", js)
    }

    private fun finishResolve(transcript: String, partial: Boolean, confidence: Double?) {
        val call = activeCall ?: return
        activeCall = null
        clearMaxTimeout()
        try {
            recognizer?.destroy()
        } catch (_: Exception) {
        }
        recognizer = null
        val out = JSObject()
        out.put("transcript", transcript)
        out.put("partial", partial)
        out.put("recognizer", recognizerComponent)
        if (confidence != null) {
            out.put("confidence", confidence)
        }
        call.resolve(out)
    }

    private fun finishReject(message: String) {
        val call = activeCall ?: return
        activeCall = null
        clearMaxTimeout()
        try {
            recognizer?.destroy()
        } catch (_: Exception) {
        }
        recognizer = null
        if (
            message == "no_match"
            || message == "timeout"
            || message == "cancelled"
            || message == "network"
            || message == "busy"
            || message == "audio"
            || message == "server"
        ) {
            val out = JSObject()
            out.put("transcript", "")
            out.put("partial", false)
            out.put("reason", message)
            out.put("recognizer", recognizerComponent)
            call.resolve(out)
            return
        }
        call.reject(message)
    }

    private fun tearDown(cancelActive: Boolean) {
        clearMaxTimeout()
        try {
            recognizer?.cancel()
        } catch (_: Exception) {
        }
        try {
            recognizer?.destroy()
        } catch (_: Exception) {
        }
        recognizer = null
        if (cancelActive) {
            val call = activeCall
            activeCall = null
            if (call != null) {
                val out = JSObject()
                out.put("transcript", "")
                out.put("partial", false)
                out.put("reason", "cancelled")
                call.resolve(out)
            }
        }
    }

    private fun clearMaxTimeout() {
        maxTimeoutRunnable?.let { mainHandler.removeCallbacks(it) }
        maxTimeoutRunnable = null
    }

    override fun load() {
        super.load()
        mainHandler.post {
            for (cn in PREFERRED_RECOGNIZERS + FALLBACK_RECOGNIZERS) {
                try {
                    val sr = SpeechRecognizer.createSpeechRecognizer(context, cn)
                    Log.i(TAG, "probe OK ${cn.flattenToString()}")
                    try {
                        sr.destroy()
                    } catch (_: Exception) {
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "probe FAIL ${cn.flattenToString()}: ${e.message}")
                }
            }
            try {
                val def = SpeechRecognizer.createSpeechRecognizer(context)
                Log.i(TAG, "probe OK default")
                def.destroy()
            } catch (e: Exception) {
                Log.w(TAG, "probe FAIL default: ${e.message}")
            }
        }
    }

    override fun handleOnDestroy() {
        tearDown(cancelActive = true)
        super.handleOnDestroy()
    }
}
