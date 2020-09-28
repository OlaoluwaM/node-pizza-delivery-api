// File for performing data operations

// Dependencies
const path = require('path');
const helpers = require('./helpers');
const fsPromises = require('fs/promises');

const private = {
  destDir: path.join(__dirname, '/../.data/'),

  generatePath(dir, file) {
    return `${this.destDir}${dir}/${file}.json`;
  },

  formatResult(type, data) {
    return { type, data };
  },
};

const dataLib = {
  async create(dir, file, dataToWriteToFile, update = false) {
    const filePath = private.generatePath(dir, file);
    const flag = update ? 'w' : 'wx';

    let fileHandle = null;

    try {
      const dataToString = helpers.validateType(dataToWriteToFile, 'string')
        ? dataToWriteToFile
        : JSON.stringify(dataToWriteToFile, null, 2);

      fileHandle = await fsPromises.open(filePath, flag);
      await fileHandle.write(dataToString);

      return;
    } catch {
      let errorMsg = `There was an error creating the file: '${file}', it may already exist`;

      if (update) {
        errorMsg = `There was an error updating the file: '${file}'`;
      }

      throw private.formatResult('error', errorMsg);
    } finally {
      if (fileHandle) {
        fileHandle.close();
      }
    }
  },

  async read(dir, file) {
    const filePath = private.generatePath(dir, file);

    let fileData = null;

    try {
      const rawDataString = await fsPromises.readFile(filePath, 'utf-8');

      fileData = helpers.normalizeToObject(rawDataString);

      return private.formatResult('success', fileData);
    } catch (error) {
      const errorMsg = `There was an error reading from file, the file may not exist. ${error}`;
      throw private.formatResult('error', errorMsg);
    }
  },

  async append(dir, file, dataToWriteToFile) {
    const filePath = private.generatePath(dir, file);

    let fileHandle = null;
    try {
      const dataToString = helpers.validateType(dataToWriteToFile, 'string')
        ? dataToWriteToFile
        : JSON.stringify(dataToWriteToFile, null, 2);

      fileHandle = await fsPromises.open(filePath, 'a');
      await fileHandle.appendFile(dataToString);

      return;
    } catch (error) {
      const errorMsg = `There was an error updating the file ${file}, in the directory ${dir}; it may already exist. ${error}`;

      throw private.formatResult('error', errorMsg);
    } finally {
      if (!fileHandle) return;
      fileHandle.close();
    }
  },

  async update(dir, file, dataToWriteToFile) {
    if (!helpers.validateType(dataToWriteToFile, 'string')) {
      dataToWriteToFile = JSON.stringify(dataToWriteToFile);
    }

    try {
      const errMsg = await this.create(dir, file, dataToWriteToFile, true);
      if (errMsg) throw errMsg;

      return;
    } catch (error) {
      throw private.formatResult('error', error);
    }
  },

  async delete(dir, file) {
    const filePath = private.generatePath(dir, file);

    try {
      await fsPromises.unlink(filePath);

      return;
    } catch (error) {
      const errorMsg = `There was an error deleting file '${file}' from ${dir}. ${error}`;

      throw private.formatResult('error', errorMsg);
    }
  },

  async doesFileExist(dir, file) {
    const filePath = private.generatePath(dir, file);
    try {
      await fsPromises.access(filePath);
      return;
    } catch {
      throw private.formatResult('error', 'Cannot access file');
    }
  },
};

module.exports = Object.freeze(dataLib);
