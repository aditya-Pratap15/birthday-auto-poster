/**
 * 🌟 BORN TODAY HOLLYWOOD - PERMANENT GOOGLE DRIVE BRIDGE
 * ---------------------------------------------------------------------
 * Automatically serves the daily celebrity JSON payload AND finds/attaches
 * the 1:1 character asset images from the 'Celebrity Birthdays' Google Drive folder.
 *
 * Folder ID: 1MNnB2l0VAtat57L3ZEcx7ZtZnQUgvjUm
 *
 * How to Deploy (One-time, Takes 30 seconds):
 * 1. Open your Google Apps Script project at:
 *    https://script.google.com/
 * 2. Paste this entire code into `Code.gs`, replacing all previous contents.
 * 3. Click "Deploy" (top right) -> "Manage deployments" -> Click Edit (pencil icon).
 * 4. Under Version, select "New version".
 * 5. Under "Execute as", select: "Me" (your Google account).
 * 6. Under "Who has access", select: "Anyone" (crucial for GitHub Actions).
 * 7. Click "Deploy"!
 */

var TARGET_FOLDER_ID = "1MNnB2l0VAtat57L3ZEcx7ZtZnQUgvjUm";

function doGet(e) {
  try {
    var folder = DriveApp.getFolderById(TARGET_FOLDER_ID);
    
    // ---------------------------------------------------------
    // 1. Direct File ID Download (Base64)
    // ---------------------------------------------------------
    if (e && e.parameter && e.parameter.fileId) {
      var file = DriveApp.getFileById(e.parameter.fileId);
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        id: file.getId(),
        name: file.getName(),
        mimeType: file.getMimeType(),
        base64: Utilities.base64Encode(file.getBlob().getBytes())
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // ---------------------------------------------------------
    // 2. Fetch Asset by Celebrity Name & Optional Date
    // ---------------------------------------------------------
    if (e && e.parameter && e.parameter.action === 'get_asset' && e.parameter.name) {
      var searchName = e.parameter.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      var searchDate = e.parameter.date || '';
      var filesIter = folder.getFiles();
      var matchedFile = null;

      while (filesIter.hasNext()) {
        var f = filesIter.next();
        var fName = f.getName().toLowerCase();
        if (fName.match(/\.(png|jpg|jpeg|webp)$/i)) {
          var cleanFName = fName.replace(/[^a-z0-9]/g, '');
          if (cleanFName.indexOf(searchName) !== -1) {
            if (!searchDate || fName.indexOf(searchDate) !== -1) {
              matchedFile = f;
              break;
            }
          }
        }
      }

      if (matchedFile) {
        return ContentService.createTextOutput(JSON.stringify({
          success: true,
          found: true,
          id: matchedFile.getId(),
          name: matchedFile.getName(),
          base64: Utilities.base64Encode(matchedFile.getBlob().getBytes()),
          downloadUrl: "https://drive.google.com/uc?export=download&id=" + matchedFile.getId()
        })).setMimeType(ContentService.MimeType.JSON);
      } else {
        return ContentService.createTextOutput(JSON.stringify({
          success: true,
          found: false,
          error: "No matching asset image found for " + e.parameter.name
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    // ---------------------------------------------------------
    // 3. Default: Locate Today's JSON and Auto-Enrich with Character Assets
    // ---------------------------------------------------------
    var requestedDate = (e && e.parameter && e.parameter.date) ? e.parameter.date : null;
    var jsonFile = null;

    if (requestedDate) {
      var exactFiles = folder.getFilesByName("celebrity_birthdays_" + requestedDate + ".json");
      if (exactFiles.hasNext()) jsonFile = exactFiles.next();
    }

    // Fallback: search newest JSON file in folder
    if (!jsonFile) {
      var allJson = [];
      var fIter = folder.getFiles();
      while (fIter.hasNext()) {
        var cf = fIter.next();
        if (cf.getName().indexOf(".json") !== -1 && cf.getName().indexOf("celebrity_birthdays") !== -1) {
          allJson.push(cf);
        }
      }
      allJson.sort(function(a, b) {
        return new Date(b.getLastUpdated()) - new Date(a.getLastUpdated());
      });
      if (allJson.length > 0) jsonFile = allJson[0];
    }

    if (!jsonFile) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: "No celebrity_birthdays JSON payload found in Google Drive folder."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var jsonContent = JSON.parse(jsonFile.getBlob().getDataAsString());
    var payloadDate = jsonContent.date || requestedDate || "";
    var celebs = jsonContent.celebrities || jsonContent.posts || [];

    // Pre-index all image files in the Drive folder for quick lookup
    var imageFiles = [];
    var imgIter = folder.getFiles();
    while (imgIter.hasNext()) {
      var img = imgIter.next();
      var imgName = img.getName().toLowerCase();
      if (imgName.match(/\.(png|jpg|jpeg|webp)$/i)) {
        imageFiles.push({
          file: img,
          name: img.getName(),
          nameClean: imgName.replace(/[^a-z0-9]/g, ''),
          updated: img.getLastUpdated()
        });
      }
    }

    // Match and embed character asset for the top 3 celebrities
    for (var i = 0; i < Math.min(celebs.length, 3); i++) {
      var celeb = celebs[i];
      var cName = (celeb.celebrity_name || celeb.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      var charName = '';
      if (celeb.iconic_character && celeb.iconic_character.character_name) {
        charName = celeb.iconic_character.character_name.toLowerCase().replace(/[^a-z0-9]/g, '');
      }

      var bestMatch = null;
      for (var j = 0; j < imageFiles.length; j++) {
        var candidate = imageFiles[j];
        // Check if filename contains celebrity name or character name
        var hasCeleb = cName && candidate.nameClean.indexOf(cName) !== -1;
        var hasChar = charName && candidate.nameClean.indexOf(charName) !== -1;
        var hasDate = payloadDate && candidate.name.indexOf(payloadDate) !== -1;

        if ((hasCeleb || hasChar) && hasDate) {
          bestMatch = candidate.file;
          break;
        } else if (hasCeleb || hasChar) {
          if (!bestMatch) bestMatch = candidate.file;
        }
      }

      if (bestMatch) {
        if (!celeb.thematic_asset) celeb.thematic_asset = {};
        celeb.thematic_asset.drive_file_id = bestMatch.getId();
        celeb.thematic_asset.drive_file_name = bestMatch.getName();
        celeb.thematic_asset.download_url = "https://drive.google.com/uc?export=download&id=" + bestMatch.getId();
        // Embed Base64 directly so GitHub Action never fails download
        celeb.thematic_asset.asset_b64 = Utilities.base64Encode(bestMatch.getBlob().getBytes());
      }
    }

    return ContentService.createTextOutput(JSON.stringify(jsonContent)).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

