const {
  createRunOncePlugin,
  withProjectBuildGradle,
} = require('@expo/config-plugins');

const TAG = 'with-notifee-android-maven';
const NOTIFEE_MAVEN_REPOSITORY =
  "maven { url(\"$rootDir/../node_modules/@notifee/react-native/android/libs\") }";

function addNotifeeMavenRepository(buildGradle) {
  if (buildGradle.includes(NOTIFEE_MAVEN_REPOSITORY)) {
    return buildGradle;
  }

  const allProjectsRepositoriesPattern =
    /allprojects\s*\{\s*repositories\s*\{\s*google\(\)\s*mavenCentral\(\)/m;

  if (!allProjectsRepositoriesPattern.test(buildGradle)) {
    throw new Error(
      'Could not find allprojects.repositories block in android/build.gradle to add the Notifee Maven repository.',
    );
  }

  return buildGradle.replace(
    allProjectsRepositoriesPattern,
    `allprojects {\n  repositories {\n    google()\n    mavenCentral()\n    ${NOTIFEE_MAVEN_REPOSITORY}`,
  );
}

const withNotifeeAndroidMaven = (config) =>
  withProjectBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') {
      throw new Error(
        'with-notifee-android-maven only supports groovy android/build.gradle projects.',
      );
    }

    config.modResults.contents = addNotifeeMavenRepository(
      config.modResults.contents,
    );

    return config;
  });

module.exports = createRunOncePlugin(
  withNotifeeAndroidMaven,
  TAG,
  '1.0.0',
);
