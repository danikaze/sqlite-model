#!/usr/bin/env bash

BUILD_DIR=build
ORIGINAL_DIR=`pwd`
SCRIPT_DIR=$( cd $( dirname "${BASH_SOURCE[0]}" ) && pwd )

npm run test && npm run build
cp README.md ${BUILD_DIR}
grep -v "private" package.json > ${BUILD_DIR}/package.json

cd ${BUILD_DIR}
# npm publish
cd ..
# rm -rf ${BUILD_DIR}

cd ${ORIGINAL_DIR}
