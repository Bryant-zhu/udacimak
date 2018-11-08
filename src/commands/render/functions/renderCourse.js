#!/usr/bin/env node
import {
  getCourseType,
  makeRootDir,
  writeHtmlLesson,
  writeHTMLNanodegreeSummary,
} from '.';
import {
  logger,
  makeDir,
  filenamify,
} from '../../utils';

const async = require('async');
const dirTree = require('directory-tree');
const fs = require('fs');


/**
 * Render a whole course/Nanodegree by creating HTML files, downloading resources
 * (videos, images)
 * @param {string} path path to source JSON files of a course/nanodegree
 * @param {string} targetDir target directory to save the contents
 */
export default function pathTemplateHtmlrenderCourse(path, targetDir) {
  return new Promise((resolve, reject) => { // eslint-disable-line
    if (path === targetDir) {
      const _error = new Error('Target directory must not be the same with source directory. Please change the target directory.');
      reject(_error);
      return null;
    }

    fs.access(targetDir, fs.constants.F_OK, (err) => {
      if (err) {
        const _error = new Error(`Target directory doesn't exist. Please create the directory "${targetDir}"`);
        reject(_error);
        return null;
      }

      let courseType;
      const sourceDirTree = dirTree(path);
      if (!sourceDirTree) {
        const _error = new Error('Path to downloaded Udacity course/Nanodegree doesn\'t exist.');
        reject(_error);
        return null;
      }

      const nanodegreeName = sourceDirTree.name;

      if (filenamify(path) === filenamify(`${targetDir}/${nanodegreeName}`)) {
        const _error = new Error('Please choose another target directory to avoid rendering contents into the same folder that contains downloaded JSON data from Udacity.');
        reject(_error);
        return null;
      }

      // flag to determine if this folder contains downloaded course JSON from Udacity
      let isCourseFolder = false;
      for (let i = 0, len = sourceDirTree.children.length; i < len; i += 1) {
        const child = sourceDirTree.children[i];
        if (child.name === 'data.json') {
          // check if this is a nanodegree, free course or what
          courseType = getCourseType(path);
          isCourseFolder = true;

          break;
        }
      }
      if (!isCourseFolder) {
        logger.info(`${path} doesn't contain 'data.json' to start rendering the contents. Are you sure this folder contains downloaded course JSON from Udacity?`);
        resolve();
        return null;
      }
      // create the root folder for the course
      const dirNanodegree = makeRootDir(targetDir, nanodegreeName);
      // create Nanodegree summary home page
      let promiseNanodegreeSummary;
      if (courseType === 'NANODEGREE') {
        promiseNanodegreeSummary = writeHTMLNanodegreeSummary(path, dirNanodegree, nanodegreeName);
      } else {
        promiseNanodegreeSummary = new Promise(resolveNdSummary => resolveNdSummary());
      }

      return promiseNanodegreeSummary
        .then(() => {
          async.eachSeries(sourceDirTree.children, (treePart, doneSourceDir) => {
            if (courseType === 'COURSE') {
              // this is a course, so create Lessons now
              if (treePart.type === 'directory') {
                const pathSourceJSON = treePart.path;
                const pathLesson = makeDir(dirNanodegree, treePart.name);
                writeHtmlLesson(pathSourceJSON, pathLesson, doneSourceDir);
              } else {
                doneSourceDir();
              } //.if
            } else if (courseType === 'NANODEGREE') {
              // this is a nanodegree

              // loop through "Part" folders
              if (treePart.type === 'directory') {
                // retrieve part number
                const prefixPart = treePart.name.match(/Part [\d]+/i);

                async.eachSeries(treePart.children, (treeModule, donePart) => {
                  // loop through "Module" folders
                  if (treeModule.type === 'directory') {
                    // retrieve module number
                    const prefixModule = treeModule.name.match(/Module [\d]+/i);

                    async.eachSeries(treeModule.children, (treeLesson, doneModule) => {
                      // loop through "Lesson" folders
                      if (treeLesson.type === 'directory') {
                        const dirNameLesson = `${prefixPart}-${prefixModule}-${treeLesson.name}`;
                        const pathLesson = makeDir(dirNanodegree, dirNameLesson);

                        const pathSourceJSON = `${path}/${treePart.name}/${treeModule.name}/${treeLesson.name}`;
                        writeHtmlLesson(pathSourceJSON, pathLesson, doneModule);
                      } else {
                        doneModule();
                      }
                    }, (error) => {
                      if (error) throw error;
                      donePart();
                    }); // .each Lesson
                  } else {
                    donePart();
                  } // .if
                }, (error) => {
                  if (error) throw error;
                  doneSourceDir();
                }); // .each Module
              } else {
                doneSourceDir();
              } // .if
            } //.if courseType
          }, (error) => {
            if (error) throw error;

            logger.info(`Completed parsing and creating local content for ${nanodegreeName}`);
            resolve();
          }); //.async.eachSeries Part
        })
        .catch((error) => {
          throw error;
        }); //.promiseNanodegreeSummary
    });
  }); //.return Promise
}
