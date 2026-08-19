package com.voicelogger.offline;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import androidx.appcompat.app.AlertDialog;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class MainActivity extends BridgeActivity {
    public static ValueCallback<Uri[]> filePathCallback;
    public static final int FILECHOOSER_RESULTCODE = 1002;
    public static final int CAMERA_PERMISSION_CODE = 1003;
    private Uri cameraImageUri;
    private WebChromeClient.FileChooserParams pendingFileChooserParams;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeSpeechPlugin.class);
        super.onCreate(savedInstanceState);

        if (this.bridge != null && this.bridge.getWebView() != null) {
            WebSettings settings = this.bridge.getWebView().getSettings();
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setCacheMode(WebSettings.LOAD_DEFAULT);
            settings.setMediaPlaybackRequiresUserGesture(false);
            settings.setAllowFileAccess(true);
            settings.setAllowContentAccess(true);
            settings.setJavaScriptEnabled(true);
            settings.setAllowFileAccessFromFileURLs(true);
            settings.setAllowUniversalAccessFromFileURLs(true);
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

            this.bridge.getWebView().setWebChromeClient(new com.getcapacitor.BridgeWebChromeClient(this.bridge) {
                @Override
                public void onPermissionRequest(final PermissionRequest request) {
                    request.grant(request.getResources());
                }

                @Override
                public boolean onShowFileChooser(android.webkit.WebView webView, ValueCallback<Uri[]> callback, WebChromeClient.FileChooserParams fileChooserParams) {
                    if (MainActivity.filePathCallback != null) {
                        try { MainActivity.filePathCallback.onReceiveValue(null); } catch (Exception e) {}
                    }
                    MainActivity.filePathCallback = callback;
                    pendingFileChooserParams = fileChooserParams;

                    showImageSourceDialog();
                    return true;
                }
            });
        }

        requestAppPermissions();
    }

    private void requestAppPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            String[] permissions = {
                Manifest.permission.RECORD_AUDIO,
                Manifest.permission.CAMERA
            };
            boolean needRequest = false;
            for (String p : permissions) {
                if (ContextCompat.checkSelfPermission(this, p) != PackageManager.PERMISSION_GRANTED) {
                    needRequest = true;
                    break;
                }
            }
            if (needRequest) {
                ActivityCompat.requestPermissions(this, permissions, 1001);
            }
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    }

    private boolean hasCameraPermission() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED;
    }

    private void showImageSourceDialog() {
        String[] options;
        if (hasCameraPermission()) {
            options = new String[]{"Take Photo", "Choose from Gallery", "Cancel"};
        } else {
            options = new String[]{"Request Camera Permission", "Choose from Gallery", "Cancel"};
        }

        new AlertDialog.Builder(this)
            .setTitle("Select Image Source")
            .setItems(options, (dialog, which) -> {
                if (which == 0) {
                    if (hasCameraPermission()) {
                        openCamera();
                    } else {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                            ActivityCompat.requestPermissions(this,
                                new String[]{Manifest.permission.CAMERA}, CAMERA_PERMISSION_CODE);
                        }
                    }
                } else if (which == 1) {
                    openGallery();
                } else {
                    cancelFileCallback();
                }
            })
            .setOnCancelListener(dialog -> cancelFileCallback())
            .show();
    }

    private void cancelFileCallback() {
        if (filePathCallback != null) {
            try { filePathCallback.onReceiveValue(null); } catch (Exception e) {}
            filePathCallback = null;
        }
    }

    private void openCamera() {
        try {
            File photoFile = createImageFile();
            if (photoFile == null) {
                openGallery();
                return;
            }

            cameraImageUri = FileProvider.getUriForFile(
                this,
                getApplicationContext().getPackageName() + ".fileprovider",
                photoFile
            );

            Intent cameraIntent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            cameraIntent.putExtra(MediaStore.EXTRA_OUTPUT, cameraImageUri);
            cameraIntent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);

            Intent[] extraIntents = new Intent[]{cameraIntent};
            Intent chooserIntent = Intent.createChooser(
                pendingFileChooserParams != null ? pendingFileChooserParams.createIntent() : createGalleryIntent(),
                "Select Image"
            );
            chooserIntent.putExtra(Intent.EXTRA_INITIAL_INTENTS, extraIntents);

            startActivityForResult(chooserIntent, FILECHOOSER_RESULTCODE);
        } catch (Exception e) {
            openGallery();
        }
    }

    private void openGallery() {
        try {
            Intent galleryIntent;
            if (pendingFileChooserParams != null) {
                try {
                    galleryIntent = pendingFileChooserParams.createIntent();
                } catch (Exception e) {
                    galleryIntent = createGalleryIntent();
                }
            } else {
                galleryIntent = createGalleryIntent();
            }
            startActivityForResult(galleryIntent, FILECHOOSER_RESULTCODE);
        } catch (Exception e) {
            cancelFileCallback();
        }
    }

    private Intent createGalleryIntent() {
        Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("image/*");
        return Intent.createChooser(intent, "Select Photo");
    }

    private File createImageFile() {
        try {
            String timeStamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.getDefault()).format(new Date());
            String imageFileName = "IMG_" + timeStamp + "_";
            File storageDir = getExternalFilesDir(Environment.DIRECTORY_PICTURES);
            if (storageDir != null && !storageDir.exists()) {
                storageDir.mkdirs();
            }
            return File.createTempFile(imageFileName, ".jpg", storageDir);
        } catch (IOException e) {
            return null;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILECHOOSER_RESULTCODE) {
            if (filePathCallback == null) return;
            Uri[] results = null;

            if (resultCode == RESULT_OK) {
                if (data != null && data.getData() != null) {
                    results = new Uri[]{data.getData()};
                } else if (cameraImageUri != null) {
                    results = new Uri[]{cameraImageUri};
                }
            }

            try {
                filePathCallback.onReceiveValue(results);
            } catch (Exception e) {}
            filePathCallback = null;
            cameraImageUri = null;
        }

        if (requestCode == CAMERA_PERMISSION_CODE) {
            if (hasCameraPermission()) {
                openCamera();
            } else {
                openGallery();
            }
        }
    }
}
