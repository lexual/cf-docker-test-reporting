'use strict';

const recursiveReadSync = require('recursive-readdir-sync');
const Exec = require('child_process').exec;
const fs = require('fs');
const config = require('../config');

class FileManager {
    static async uploadFiles({ srcDir, bucket, buildId }) {
        return new Promise(async (res, rej) => {
            try {
                const files = await recursiveReadSync(srcDir);

                console.log('Start upload report files');

                const uploadPromises = files.map((f) => {
                    const pathToDeploy = buildId + f.replace(srcDir, '');

                    return new Promise((resolve, reject) => {
                        bucket.upload(f, { destination: pathToDeploy }, (err) => {
                            if (!err) {
                                console.log(`File ${pathToDeploy} successful uploaded`);
                                resolve(true);
                            } else {
                                console.error(`Fail to upload file ${pathToDeploy}, error: `, err.message ? err.message : err);
                                reject(new Error('Fail to upload file'));
                            }
                        });
                    });
                });

                Promise.all(uploadPromises).then(() => { res(true); }, (err) => { rej(err); });
            } catch (err) {
                if (err.errno === 34) {
                    rej(new Error('Error while uploading files: Path does not exist'));
                } else {
                    rej(new Error(`Error while uploading files: ${err.message || 'Error while uploading files'}`));
                }
            }
        });
    }

    static getDirSize(pathToDir) {
        return new Promise((res) => {
            Exec(`du -sk ${pathToDir}`, (err, response) => {
                const match = response.trim().match(/^[\d\.\,]+/);

                if (!match) {
                    res(null);
                }

                res(parseInt(match.toString().trim()) / 1024);
            });
        });
    }

    static async validateUploadDir(pathToDir) {
        if (!fs.existsSync(pathToDir)) {
            throw new Error(`Error: Directory for upload is not exists. 
Ensure that "working_directory" was specified for this step and he contains directory for upload`);
        }

        if (!fs.readdirSync(pathToDir).length) {
            throw new Error('Error: Directory for upload is empty');
        }

        if (config.directoryForUploadMaxSize < await this.getDirSize(pathToDir)) {
            throw new Error(`Error: Directory for upload is to large, max size is ${config.directoryForUploadMaxSize} MB`)
        }

        return true;
    }
}

module.exports = FileManager;
