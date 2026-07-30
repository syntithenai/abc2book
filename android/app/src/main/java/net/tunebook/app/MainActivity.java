package net.tunebook.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(TunebookYoutubePlugin.class);
        registerPlugin(TunebookMediaPlugin.class);
        registerPlugin(TunebookLocalMediaPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onStop() {
        TunebookMediaService.ensurePlaybackFromActivity(this);
        super.onStop();
    }
}
