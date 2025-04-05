#!/bin/bash

# Paths relative to root dir project

# Vars
NAME=$(node -p "require('./package.json').name")
VERSION=$(node -p "require('./package.json').version")
ALT_COPY=$1

# Script settings
CMD_BUILD="npm run build:lib:prod" # Option --silent
BUILD_OUT_DIR="./dist/" # Require slash to end
DEPLOY_PATH="./deploy/" # Require slash to end
DEPLOY_BRANCH="main"

# Script code

ON_DEPLOY_BRANCH=0

# First time create folders
mkdir -p $DEPLOY_PATH

# Internal output path
if [ -n "$ALT_COPY" ]; then
  ALT_COPY="${ALT_COPY%/}/" # Force slash to end
  if [ ! -d "$ALT_COPY" ]; then
    echo "[ERROR] Alt. copy output path not exists or isn't a folder: '$ALT_COPY'"
    exit
  fi
fi


#
echo "[INFO] Deleting old files..."
find $DEPLOY_PATH -name "${NAME}-v*.tgz" -type f -delete

# On deploy branch?
if [ "$(git rev-parse --abbrev-ref HEAD)" = "$DEPLOY_BRANCH" ]; then
  echo "[INFO] Project is on deploy branch: $DEPLOY_BRANCH."
  ON_DEPLOY_BRANCH=1
else
  echo "[WARN] Git error or project isn't on deploy branch: $DEPLOY_BRANCH. Tag actions disabled."
fi

# Version tag already exists?
if [ $ON_DEPLOY_BRANCH -eq 1 ]; then
  if git tag | grep -q "^v${VERSION}$"; then
    echo "[ERROR] Tag of version v${VERSION} already exists."
    exit
  fi
fi

# Check git status
CMD_GIT_STATUS_OUTPUT=$(git status 2>&1)

# Its git repo ok?
if [ $ON_DEPLOY_BRANCH -eq 1 ]; then
  if [ -z "$(echo "$CMD_GIT_STATUS_OUTPUT" | grep "nothing to commit, working tree clean")" ]; then
    echo "[ERROR] Git working directory not clean. Please, commit before deploy."
    exit
  fi
fi

# Try build project
echo "[INFO] Building project..."
$CMD_BUILD
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
  echo "[ERROR] Project build has errors."
  exit
fi

# BUILD_OUT_DIR exist?
if [ ! -d "${BUILD_OUT_DIR}${NAME}" ]; then
  echo "[ERROR] Path '${BUILD_OUT_DIR}${NAME}' not exists."
  exit
fi

# Make tar
tar czf "${DEPLOY_PATH}${NAME}-v${VERSION}.tgz" -C "${BUILD_OUT_DIR}" "${NAME}/"

if [ ! -f "${DEPLOY_PATH}${NAME}-v${VERSION}.tgz" ]; then
  echo "[ERROR] Deploy file '${DEPLOY_PATH}${NAME}-v${VERSION}.tgz' not exists."
  exit
fi

# Copy?
if [ -n "$ALT_COPY" ]; then
  cp -f "${DEPLOY_PATH}${NAME}-v${VERSION}.tgz" "${ALT_COPY}${NAME}-v${VERSION}.tgz"
fi

# Tag repo
if [ $ON_DEPLOY_BRANCH -eq 1 ]; then
  echo "[INFO] Tagging release version..."
  git tag -a v$VERSION -m "Release v$VERSION"
  git push --tags
fi

echo "[INFO] Deploy script finished sucessfully."
echo "[INFO] Deploy file: '${DEPLOY_PATH}${NAME}-v${VERSION}.tgz'"
if [ -n "$ALT_COPY" ]; then
  echo "[INFO] Alt. copy: '${ALT_COPY}${NAME}-v${VERSION}.tgz'"
fi
echo "[INFO] Have a nice day my dev king! :)"
