'use strict';

const BasicTestReporter = require('./BasicTestReporter');
const recursiveReadSync = require('recursive-readdir-sync');
const Exec = require('child_process').exec;
const fs = require('fs');
const config = require('../config');
const path = require('path');

const { isUploadMode } = new BasicTestReporter();

class FileManager {
    static async uploadFiles({ srcDir, bucket, buildId, uploadFile, isUploadFile }) {
        return new Promise(async (res, rej) => {
            try {
                const files = await this._getFilesForUpload({ srcDir, uploadFile, isUploadFile });

                console.log('Start upload report files');

                const uploadPromises = files.map((f) => {
                    const pathToDeploy = this._getFilePathForDeploy({ f, buildId, srcDir, isUploadFile, uploadFile });

                    return new Promise((resolve, reject) => {
                        bucket.upload(f, { destination: pathToDeploy }, (err) => {
                            if (err) {
                                console.error(`Fail to upload file ${pathToDeploy}, error: `, err.message ? err.message : err);
                                reject(new Error('Fail to upload file'));
                            } else {
                                console.log(`File ${pathToDeploy} successful uploaded`);
                                resolve(true);
                            }
                        });
                    });
                });

                Promise.all(uploadPromises).then(() => {
                    console.log(`All report files was successfully uploaded.
You can access it on https://g.codefresh.io/api/testReporting/${buildId}/${process.env.REPORT_INDEX_FILE || 'index.html'}`);
                    res(true);
                }, (err) => { rej(err); });
            } catch (err) {
                rej(new Error(`Error while uploading files: ${err.message || 'Unknown error'}`));
            }
        });
    }

    static getDirOrFileSize(pathToResource) {
        return new Promise((res) => {
            Exec(`du -sk ${pathToResource}`, (err, response) => {
                const match = response.trim().match(/^[\d.,]+/);

                if (!match) {
                    res(null);
                }

                res(parseInt(match.toString().trim(), 10) / 1024);
            });
        });
    }

    static async validateUploadDir(pathToDir) {
        if (!fs.existsSync(pathToDir)) {
            throw new Error(`Error: Directory for upload does not exist. 
Ensure that "working_directory" was specified for this step and it contains the directory for upload`);
        }

        if (!fs.readdirSync(pathToDir).length) {
            throw new Error('Error: Directory for upload is empty');
        }

        if (config.uploadMaxSize < await this.getDirOrFileSize(pathToDir)) {
            throw new Error(`Error: Directory for upload is to large, max size is ${config.uploadMaxSize} MB`);
        }

        return true;
    }

    static async validateUploadFile(pathToFile) {
        if (!fs.existsSync(pathToFile)) {
            throw new Error(`Error: FIle for upload does not exist. 
Ensure that "working_directory" was specified for this step and it contains the file for upload`);
        }

        if (config.uploadMaxSize < await this.getDirOrFileSize(pathToFile)) {
            throw new Error(`Error: File for upload is to large, max size is ${config.uploadMaxSize} MB`);
        }

        return true;
    }

    static validateUploadResource({ isUploadFile, uploadIndexFile, dirForUpload }) {
        if (isUploadFile) {
            return this.validateUploadFile(uploadIndexFile);
        } else {
            return this.validateUploadDir(dirForUpload);
        }
    }

    static _getFilesForUpload({ srcDir, uploadFile, isUploadFile }) {
        if (!isUploadFile) {
            return recursiveReadSync(srcDir);
        } else {
            return [uploadFile];
        }
    }

    static _getFilePathForDeploy({ f, buildId, srcDir, isUploadFile, uploadFile }) {
        if (!isUploadFile) {
            const pathWithoutSrcDir = f.replace(srcDir, '');
            return buildId + (pathWithoutSrcDir.startsWith('/') ? pathWithoutSrcDir : `/${pathWithoutSrcDir}`);
        } else {
            return `${buildId}/${path.parse(uploadFile).base}`;
        }
    }

    static removeTestReportDir() {
        let folderForRemove;

        const isUpload = isUploadMode(config.requiredVarsForUploadMode);

        if (!isUpload || (process.env.CLEAR_TEST_REPORT && process.env.REPORT_DIR)) {
            folderForRemove = process.env.REPORT_DIR || config.sourceReportFolderName;
        }

        if (folderForRemove) {
            return new Promise((res) => {
                console.log('Start removing test report folder (we need clear test report on each build for avoid some bugs)');
                Exec(`rm -rf ${folderForRemove}`, (err) => {
                    if (err) {
                        console.error(`Cant remove report folder "${folderForRemove}", cause: 
                        ${err.message ? err.message : 'unknown error'}`);
                    } else {
                        console.log(`Test report folder "${folderForRemove}" has been removed`);
                    }

                    res(true);
                });
            });
        }

        return Promise.resolve();
    }
}

module.exports = FileManager;