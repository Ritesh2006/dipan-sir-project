// ==============================================================================
// GOOGLE APPS SCRIPT FOR GOOGLE DRIVE FOLDER: 1aaD44uttnMpWdLo19tko-8Ipl3_MUhbk
// (Folder Name: data project dipan sir)
// ==============================================================================

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var folderId = data.folderId || "1aaD44uttnMpWdLo19tko-8Ipl3_MUhbk";
    var folder = DriveApp.getFolderById(folderId);

    var bytes = Utilities.base64Decode(data.base64);
    var blob = Utilities.newBlob(bytes, data.mimeType || "application/octet-stream", data.fileName || "uploaded_file");

    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      fileId: file.getId(),
      webViewLink: file.getUrl()
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ==============================================================================
// STEP 1: Select "authorizeDrive" in the dropdown and click "Run ▶" ONCE in Google Apps Script!
// ==============================================================================
function authorizeDrive() {
  var folder = DriveApp.getFolderById("1aaD44uttnMpWdLo19tko-8Ipl3_MUhbk");
  var testFile = folder.createFile("welcome_test.txt", "Google Drive Upload System Active for data project dipan sir!");
  Logger.log("SUCCESS! File created in folder: " + testFile.getUrl());
}
