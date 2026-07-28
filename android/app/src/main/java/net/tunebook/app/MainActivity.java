package net.tunebook.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(TunebookYoutubePlugin.class);
        registerPlugin(TunebookMediaPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
