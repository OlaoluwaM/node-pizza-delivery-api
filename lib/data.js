// File for performing data operations

// Dependencies
const path = require('path');
const helpers = require('./helpers');
const fsPromises = require('fs/promises');
const CustomError = require('./custom-error');

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
      let errorMsg = `There was an error creating the resource,'${file}', on the server`;

      if (update) {
        errorMsg = `There was an error updating the resource,'${file}', on the server`;
      }

      throw new CustomError(errorMsg);
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
    } catch {
      throw new CustomError(`There was an error reading this resource, ${file}, it may not exist`);
    }
  },

  async append(dir, file, dataToWriteToFile) {
    const filePath = private.generatePath(dir, file);

    let fileHandle = null;
    try {
      const dataToString = helpers.validateType(dataToWriteToFile, 'string')
        ? dataToWriteToFile
        : JSON.stringify(dataToWriteToFile);

      fileHandle = await fsPromises.open(filePath, 'a');
      await fileHandle.appendFile(dataToString);

      return;
    } catch {
      throw new CustomError(`There was an error updating the resource, ${file}`);
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
    } catch {
      throw new CustomError(errorMsg);
    }
  },

  async delete(dir, file) {
    const filePath = private.generatePath(dir, file);

    try {
      await fsPromises.unlink(filePath);

      return;
    } catch {
      throw new CustomError(`There was an error deleting resource, '${file}' from server`);
    }
  },

  async doesResourceExist(dir, file) {
    const filePath = private.generatePath(dir, file);
    try {
      await fsPromises.access(filePath);
      return;
    } catch {
      throw new CustomError(`Resource specified, ${file}, does not exist`, 500);
    }
  },
};

module.exports = Object.freeze(dataLib);
