package com.voicelogger.offline;

import android.Manifest;
import android.content.Intent;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import java.util.ArrayList;

@CapacitorPlugin(
    name = "NativeSpeech",
    permissions = {
        @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "speech")
    }
)
public class NativeSpeechPlugin extends Plugin {

    private SpeechRecognizer speechRecognizer;

    @PluginMethod
    public void startListening(PluginCall call) {
        String lang = call.getString("language", "bn-IN");
        getBridge().getActivity().runOnUiThread(() -> {
            try {
                if (speechRecognizer != null) {
                    speechRecognizer.destroy();
                }

                speechRecognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
                Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, lang);
                intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
                intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);

                speechRecognizer.setRecognitionListener(new RecognitionListener() {
                    @Override
                    public void onReadyForSpeech(Bundle params) {
                        JSObject ret = new JSObject();
                        ret.put("status", "ready");
                        notifyListeners("onSpeechState", ret);
                    }

                    @Override public void onBeginningOfSpeech() {}
                    @Override public void onRmsChanged(float rmsdB) {}
                    @Override public void onBufferReceived(byte[] buffer) {}
                    @Override public void onEndOfSpeech() {}

                    @Override
                    public void onError(int error) {
                        try {
                            Intent onlineIntent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                            onlineIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                            onlineIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang);
                            onlineIntent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
                            speechRecognizer.startListening(onlineIntent);
                        } catch (Exception e) {
                            JSObject ret = new JSObject();
                            ret.put("error", error);
                            notifyListeners("onSpeechError", ret);
                        }
                    }

                    @Override
                    public void onResults(Bundle results) {
                        ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                        if (matches != null && !matches.isEmpty()) {
                            JSObject ret = new JSObject();
                            ret.put("transcript", matches.get(0));
                            ret.put("isFinal", true);
                            notifyListeners("onSpeechResult", ret);
                        }
                    }

                    @Override
                    public void onPartialResults(Bundle partialResults) {
                        ArrayList<String> matches = partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                        if (matches != null && !matches.isEmpty()) {
                            JSObject ret = new JSObject();
                            ret.put("transcript", matches.get(0));
                            ret.put("isFinal", false);
                            notifyListeners("onSpeechResult", ret);
                        }
                    }

                    @Override public void onEvent(int eventType, Bundle params) {}
                });

                speechRecognizer.startListening(intent);
                call.resolve();
            } catch (Exception e) {
                call.reject("Failed to start native offline speech recognizer: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void stopListening(PluginCall call) {
        getBridge().getActivity().runOnUiThread(() -> {
            if (speechRecognizer != null) {
                speechRecognizer.stopListening();
            }
            call.resolve();
        });
    }
}
