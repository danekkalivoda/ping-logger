const fs = require('fs/promises');
const path = require('path');

const {
  createRunOncePlugin,
  withDangerousMod,
  withMainApplication,
} = require('@expo/config-plugins');

const TAG = 'with-public-export-module';

function getAndroidPackageName(config) {
  const packageName = config.android?.package;

  if (!packageName) {
    throw new Error(
      'with-public-export-module requires expo.android.package to be set in app.json.',
    );
  }

  return packageName;
}

function getJavaDirectory(projectRoot, packageName) {
  return path.join(
    projectRoot,
    'android',
    'app',
    'src',
    'main',
    'java',
    ...packageName.split('.'),
  );
}

function buildPublicExportModuleSource(packageName) {
  return `package ${packageName}

import android.content.ContentUris
import android.content.ContentValues
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.FileInputStream

class PublicExportModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "PublicExportModule"

  @ReactMethod
  fun exportFileToPublicDirectory(
    sourceFileUri: String,
    displayName: String,
    rootDirectory: String,
    subdirectory: String,
    mimeType: String,
    promise: Promise,
  ) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
      promise.reject("E_UNSUPPORTED_ANDROID", "Public exports require Android 10 or newer.")
      return
    }

    try {
      val relativePath = buildRelativePath(rootDirectory, subdirectory)
      val resolver = reactApplicationContext.contentResolver
      val collection = MediaStore.Files.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)

      deleteExistingCopies(collection, displayName, relativePath)

      val values =
        ContentValues().apply {
          put(MediaStore.MediaColumns.DISPLAY_NAME, displayName)
          put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
          put(MediaStore.MediaColumns.RELATIVE_PATH, relativePath)
          put(MediaStore.MediaColumns.IS_PENDING, 1)
        }

      val targetUri =
        resolver.insert(collection, values)
          ?: throw IllegalStateException("Unable to create public export file.")

      try {
        openInputStream(sourceFileUri).use { input ->
          if (input == null) {
            throw IllegalStateException("Source session file is not readable.")
          }

          resolver.openOutputStream(targetUri, "w").use { output ->
            if (output == null) {
              throw IllegalStateException("Target public file is not writable.")
            }

            input.copyTo(output)
            output.flush()
          }
        }

        values.clear()
        values.put(MediaStore.MediaColumns.IS_PENDING, 0)
        resolver.update(targetUri, values, null, null)

        promise.resolve(
          Arguments.createMap().apply {
            putString("fileName", displayName)
            putString("relativePath", relativePath.removeSuffix("/"))
            putString("targetUri", targetUri.toString())
          },
        )
      } catch (writeError: Throwable) {
        resolver.delete(targetUri, null, null)
        throw writeError
      }
    } catch (error: Throwable) {
      promise.reject("E_PUBLIC_EXPORT_FAILED", error.message, error)
    }
  }

  private fun openInputStream(sourceFileUri: String) =
    Uri.parse(sourceFileUri).let { sourceUri ->
      when (sourceUri.scheme) {
        "file" -> {
          val path = sourceUri.path ?: return null
          FileInputStream(File(path))
        }

        else -> reactApplicationContext.contentResolver.openInputStream(sourceUri)
      }
    }

  private fun buildRelativePath(rootDirectory: String, subdirectory: String): String {
    val root =
      when (rootDirectory.lowercase()) {
        "documents" -> Environment.DIRECTORY_DOCUMENTS
        else -> Environment.DIRECTORY_DOWNLOADS
      }

    val normalizedSubdirectory =
      subdirectory
        .split("/", "\\\\")
        .map { it.trim() }
        .filter { it.isNotEmpty() }
        .joinToString("/")

    return if (normalizedSubdirectory.isEmpty()) {
      "$root/"
    } else {
      "$root/$normalizedSubdirectory/"
    }
  }

  private fun deleteExistingCopies(collection: Uri, displayName: String, relativePath: String) {
    val resolver = reactApplicationContext.contentResolver
    val projection = arrayOf(MediaStore.MediaColumns._ID)
    val selection =
      "\${MediaStore.MediaColumns.DISPLAY_NAME} = ? AND \${MediaStore.MediaColumns.RELATIVE_PATH} = ?"
    val args = arrayOf(displayName, relativePath)

    resolver.query(collection, projection, selection, args, null)?.use { cursor ->
      val idIndex = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns._ID)
      while (cursor.moveToNext()) {
        val id = cursor.getLong(idIndex)
        resolver.delete(ContentUris.withAppendedId(collection, id), null, null)
      }
    }
  }
}
`;
}

function buildPublicExportPackageSource(packageName) {
  return `package ${packageName}

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

@Suppress("DEPRECATION")
class PublicExportPackage : ReactPackage {
  @Suppress("DEPRECATION")
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    return listOf(PublicExportModule(reactContext))
  }

  @Suppress("DEPRECATION")
  override fun createViewManagers(
    reactContext: ReactApplicationContext,
  ): List<ViewManager<*, *>> {
    return emptyList()
  }
}
`;
}

function ensurePackageRegistration(contents) {
  if (contents.includes('add(PublicExportPackage())')) {
    return contents;
  }

  const applyPattern = /PackageList\(this\)\.packages\.apply \{\n/;

  if (!applyPattern.test(contents)) {
    throw new Error(
      'Could not find PackageList(this).packages.apply block in MainApplication.kt.',
    );
  }

  return contents.replace(
    applyPattern,
    'PackageList(this).packages.apply {\n          add(PublicExportPackage())\n',
  );
}

const withPublicExportModule = (config) => {
  const packageName = getAndroidPackageName(config);

  config = withMainApplication(config, (cfg) => {
    if (cfg.modResults.language !== 'kt') {
      throw new Error(
        'with-public-export-module only supports Kotlin MainApplication projects.',
      );
    }

    cfg.modResults.contents = ensurePackageRegistration(cfg.modResults.contents);
    return cfg;
  });

  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const javaDirectory = getJavaDirectory(cfg.modRequest.projectRoot, packageName);
      await fs.mkdir(javaDirectory, { recursive: true });

      await fs.writeFile(
        path.join(javaDirectory, 'PublicExportModule.kt'),
        buildPublicExportModuleSource(packageName),
      );
      await fs.writeFile(
        path.join(javaDirectory, 'PublicExportPackage.kt'),
        buildPublicExportPackageSource(packageName),
      );

      return cfg;
    },
  ]);
};

module.exports = createRunOncePlugin(withPublicExportModule, TAG, '1.0.0');
