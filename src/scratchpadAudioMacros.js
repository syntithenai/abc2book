const MAX_MACRO_STEPS = 12

export function createMacroRecorder() {
  return { steps: [] }
}

export function recordMacroStep(recorder, step) {
  if (!recorder || !step) return recorder
  const steps = recorder.steps.concat([step]).slice(-MAX_MACRO_STEPS)
  return { steps: steps }
}

export async function runMacro(recorder, runner) {
  if (!recorder || !recorder.steps.length || !runner) return
  for (let i = 0; i < recorder.steps.length; i += 1) {
    await runner(recorder.steps[i])
  }
}
