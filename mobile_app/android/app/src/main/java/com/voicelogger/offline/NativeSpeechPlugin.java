package com.voicelogger.offline;

import android.Manifest;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
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
import java.util.Locale;

@CapacitorPlugin(
    name = "NativeSpeech",
    permissions = {
        @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "speech")
    }
)
public class NativeSpeechPlugin extends Plugin {

    private SpeechRecognizer speechRecognizer;
    private boolean isListeningActive = false;
    private boolean continuousMode = false;
    private String currentLang = "hi-IN";
    private boolean currentAutoDetect = false;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private Intent currentIntent;

    @PluginMethod
    public void startListening(PluginCall call) {
        String lang = call.getString("language", "hi-IN");
        boolean autoDetect = call.getBoolean("autoDetect", false);
        boolean continuous = call.getBoolean("continuous", false);

        currentLang = lang;
        currentAutoDetect = autoDetect;
        continuousMode = continuous;

        getBridge().getActivity().runOnUiThread(() -> {
            try {
                if (speechRecognizer != null) {
                    try { speechRecognizer.destroy(); } catch (Exception e) {}
                }

                speechRecognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
                Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
                intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);

                if (autoDetect) {
                    intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault().toString());
                    intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "hi-IN,en-IN,bn-IN,en-US");
                    intent.putExtra(RecognizerIntent.EXTRA_ONLY_RETURN_LANGUAGE_PREFERENCE, "hi-IN,en-IN,bn-IN,en-US");
                } else {
                    intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang);
                    intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, lang);
                }

                currentIntent = intent;

                speechRecognizer.setRecognitionListener(new RecognitionListener() {
                    @Override
                    public void onReadyForSpeech(Bundle params) {
                        isListeningActive = true;
                        JSObject ret = new JSObject();
                        ret.put("status", "ready");
                        ret.put("continuous", continuousMode);
                        notifyListeners("onSpeechState", ret);
                    }

                    @Override public void onBeginningOfSpeech() {}
                    @Override public void onRmsChanged(float rmsdB) {}
                    @Override public void onBufferReceived(byte[] buffer) {}

                    @Override
                    public void onEndOfSpeech() {
                        isListeningActive = false;
                    }

                    @Override
                    public void onError(int error) {
                        isListeningActive = false;
                        JSObject ret = new JSObject();
                        ret.put("error", error);
                        String errorName;
                        switch (error) {
                            case SpeechRecognizer.ERROR_NO_MATCH:
                                errorName = "NO_MATCH";
                                break;
                            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:
                                errorName = "SPEECH_TIMEOUT";
                                break;
                            case SpeechRecognizer.ERROR_AUDIO:
                                errorName = "AUDIO_ERROR";
                                break;
                            case SpeechRecognizer.ERROR_CLIENT:
                                errorName = "CLIENT_ERROR";
                                break;
                            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:
                                errorName = "NO_PERMISSION";
                                break;
                            case SpeechRecognizer.ERROR_NETWORK:
                            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:
                                errorName = "NETWORK_ERROR";
                                break;
                            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY:
                                errorName = "BUSY";
                                break;
                            default:
                                errorName = "UNKNOWN_" + error;
                                break;
                        }
                        ret.put("errorName", errorName);
                        ret.put("isNetworkError",
                            error == SpeechRecognizer.ERROR_NETWORK ||
                            error == SpeechRecognizer.ERROR_NETWORK_TIMEOUT);
                        ret.put("isRetryable",
                            error == SpeechRecognizer.ERROR_NO_MATCH ||
                            error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT ||
                            error == SpeechRecognizer.ERROR_AUDIO);
                        notifyListeners("onSpeechError", ret);

                        if (continuousMode && isContinuousRetryable(error)) {
                            handler.postDelayed(() -> restartListeningInternal(), 400);
                        }
                    }

                    @Override
                    public void onResults(Bundle results) {
                        isListeningActive = false;
                        ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                        if (matches != null && !matches.isEmpty()) {
                            JSObject ret = new JSObject();
                            ret.put("transcript", matches.get(0));
                            ret.put("isFinal", true);
                            ret.put("continuous", continuousMode);
                            if (autoDetect && results.containsKey(SpeechRecognizer.RESULTS_RECOGNITION)) {
                                ret.put("confidence", results.getFloat(SpeechRecognizer.CONFIDENCE_SCORES, 0f));
                            }
                            notifyListeners("onSpeechResult", ret);
                        }

                        if (continuousMode) {
                            handler.postDelayed(() -> restartListeningInternal(), 350);
                        }
                    }

                    @Override
                    public void onPartialResults(Bundle partialResults) {
                        ArrayList<String> matches = partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                        if (matches != null && !matches.isEmpty()) {
                            JSObject ret = new JSObject();
                            ret.put("transcript", matches.get(0));
                            ret.put("isFinal", false);
                            ret.put("continuous", continuousMode);
                            notifyListeners("onSpeechResult", ret);
                        }
                    }

                    @Override public void onEvent(int eventType, Bundle params) {}
                });

                speechRecognizer.startListening(intent);
                call.resolve();
            } catch (Exception e) {
                call.reject("Failed to start native speech recognizer: " + e.getMessage());
            }
        });
    }

    private boolean isContinuousRetryable(int error) {
        return error == SpeechRecognizer.ERROR_NO_MATCH ||
               error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT ||
               error == SpeechRecognizer.ERROR_AUDIO ||
               error == SpeechRecognizer.ERROR_CLIENT;
    }

    private void restartListeningInternal() {
        if (!continuousMode) return;
        try {
            if (speechRecognizer != null) {
                try { speechRecognizer.destroy(); } catch (Exception e) {}
            }
            speechRecognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
            speechRecognizer.setRecognitionListener(createContinuousListener());
            speechRecognizer.startListening(currentIntent);
        } catch (Exception e) {
            if (continuousMode) {
                handler.postDelayed(() -> restartListeningInternal(), 1000);
            }
        }
    }

    private RecognitionListener createContinuousListener() {
        return new RecognitionListener() {
            @Override
            public void onReadyForSpeech(Bundle params) {
                isListeningActive = true;
                JSObject ret = new JSObject();
                ret.put("status", "ready");
                ret.put("continuous", true);
                notifyListeners("onSpeechState", ret);
            }

            @Override public void onBeginningOfSpeech() {}
            @Override public void onRmsChanged(float rmsdB) {}
            @Override public void onBufferReceived(byte[] buffer) {}

            @Override
            public void onEndOfSpeech() {
                isListeningActive = false;
            }

            @Override
            public void onError(int error) {
                isListeningActive = false;
                JSObject ret = new JSObject();
                ret.put("error", error);
                String errorName;
                switch (error) {
                    case SpeechRecognizer.ERROR_NO_MATCH: errorName = "NO_MATCH"; break;
                    case SpeechRecognizer.ERROR_SPEECH_TIMEOUT: errorName = "SPEECH_TIMEOUT"; break;
                    case SpeechRecognizer.ERROR_AUDIO: errorName = "AUDIO_ERROR"; break;
                    case SpeechRecognizer.ERROR_CLIENT: errorName = "CLIENT_ERROR"; break;
                    case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS: errorName = "NO_PERMISSION"; break;
                    case SpeechRecognizer.ERROR_NETWORK:
                    case SpeechRecognizer.ERROR_NETWORK_TIMEOUT: errorName = "NETWORK_ERROR"; break;
                    case SpeechRecognizer.ERROR_RECOGNIZER_BUSY: errorName = "BUSY"; break;
                    default: errorName = "UNKNOWN_" + error; break;
                }
                ret.put("errorName", errorName);
                ret.put("isNetworkError", error == SpeechRecognizer.ERROR_NETWORK || error == SpeechRecognizer.ERROR_NETWORK_TIMEOUT);
                ret.put("isRetryable", error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT || error == SpeechRecognizer.ERROR_AUDIO);
                notifyListeners("onSpeechError", ret);

                if (continuousMode && isContinuousRetryable(error)) {
                    handler.postDelayed(() -> restartListeningInternal(), 400);
                }
            }

            @Override
            public void onResults(Bundle results) {
                isListeningActive = false;
                ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if (matches != null && !matches.isEmpty()) {
                    JSObject ret = new JSObject();
                    ret.put("transcript", matches.get(0));
                    ret.put("isFinal", true);
                    ret.put("continuous", true);
                    if (currentAutoDetect && results.containsKey(SpeechRecognizer.RESULTS_RECOGNITION)) {
                        ret.put("confidence", results.getFloat(SpeechRecognizer.CONFIDENCE_SCORES, 0f));
                    }
                    notifyListeners("onSpeechResult", ret);
                }
                if (continuousMode) {
                    handler.postDelayed(() -> restartListeningInternal(), 350);
                }
            }

            @Override
            public void onPartialResults(Bundle partialResults) {
                ArrayList<String> matches = partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if (matches != null && !matches.isEmpty()) {
                    JSObject ret = new JSObject();
                    ret.put("transcript", matches.get(0));
                    ret.put("isFinal", false);
                    ret.put("continuous", true);
                    notifyListeners("onSpeechResult", ret);
                }
            }

            @Override public void onEvent(int eventType, Bundle params) {}
        };
    }

    @PluginMethod
    public void stopListening(PluginCall call) {
        isListeningActive = false;
        continuousMode = false;
        handler.removeCallbacksAndMessages(null);
        getBridge().getActivity().runOnUiThread(() -> {
            if (speechRecognizer != null) {
                try { speechRecognizer.stopListening(); } catch (Exception e) {}
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        boolean available = SpeechRecognizer.isRecognitionAvailable(getContext());
        JSObject ret = new JSObject();
        ret.put("available", available);
        call.resolve(ret);
    }

    @Override
    protected void handleOnDestroy() {
        isListeningActive = false;
        continuousMode = false;
        handler.removeCallbacksAndMessages(null);
        if (speechRecognizer != null) {
            try { speechRecognizer.destroy(); } catch (Exception e) {}
            speechRecognizer = null;
        }
    }
}
