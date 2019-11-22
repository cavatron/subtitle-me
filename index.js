#!/usr/bin/env node

/*	
 * Copyright IBM Corp. 2017
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

require('dotenv').config();
require("moment-duration-format");
const chalk = require('chalk');
const clear = require('clear');
const CLI = require('clui');
const figlet = require('figlet');
const inquirer = require('inquirer');
const Spinner = CLI.Spinner;
const _ = require('lodash');
const files = require('./src/files');
const ffmpeg = require('fluent-ffmpeg');
const moment = require('moment');
const SpeechToTextV1 = require('ibm-watson/speech-to-text/v1');
const { IamAuthenticator } = require('ibm-watson/auth');
const fs = require('fs');
const parser = require('subtitles-parser');
const minimist = require('minimist');
const mkdirp = require('mkdirp');

function processVideo(callback) {

  var argv = minimist(process.argv.slice(2));

  var questions = [{
    name: 'filename',
    type: 'input',
    message: 'Enter the path to the video:',
    default: argv._[0] || null,
    validate: function (value) {
      if (value.length) {
        return true;
      } else {
        return 'Please enter the path to the video';
      }
    }
  },
  {
    name: 'casing',
    type: 'list',
    message: 'Indicate whether subtitles should be sentence cased:',
    choices: ['yes', "no"],
    default: argv._[1] || 'yes',
    validate: function (value) {
      if (value.length) {
        return true;
      } else {
        return 'Please indicate whether the captions should be sentence cased';
      }
    },
  }
  ];

  inquirer.prompt(questions).then(function (answers) {
    var status = new Spinner(chalk.green('Extracting audio...'));
    status.start();

    extractAudio(answers.filename, function (err, filename) {
      if (err) {
        console.log(err.message);
        status.stop();
        return callback(err);
      } else {
        status.stop();
        return callback(err, filename, answers.casing);
      }
    });

  });
}

function extractAudio(filename, callback) {
  mkdirp('out', function (err) {
    if (err) {
      console.log(chalk.red(err));
    }
  })

  new ffmpeg({
    source: filename,
    timeout: 0
  }).withAudioCodec('libmp3lame')
    .withAudioBitrate(128)
    .withAudioChannels(2)
    .withAudioFrequency(44100)
    .withAudioQuality(5)
    .withAudioFilters('highpass=f=200', 'lowpass=f=3000')
    .toFormat('mp3')

    .on('start', function (commandLine) {
      console.log("Generating audio file from video");
    })

    .on('error', function (err, stdout, stderr) {
      return callback(err);
    })

    .on('progress', function (progress) {
      console.log(progress.percent.toFixed(0) + '%');
    })

    .on('end', function () {
      console.log("Finished generating audio file: " + files.name(filename) + '.mp3');
      return callback(null, files.name(filename) + '.mp3');
    })
    .saveToFile('out/' + files.name(filename) + '.mp3');
}

function getSubtitles(apikey, filename, callback) {
  var speechToText = new SpeechToTextV1({
    authenticator: new IamAuthenticator({ apikey }),
    url: 'https://stream.watsonplatform.net/speech-to-text/api/'
  });

  var params = {
    contentType: 'audio/mp3; rate=44100',
    timestamps: true,
    continuous: true,
    interimResults: true,
    maxAlternatives: 1,
    smartFormatting: false,
    audio: fs.createReadStream('out/' + filename),
    model: 'en-US_BroadbandModel'
  };

  var size = files.size('out/' + filename);
  console.log("Size of audio file: " + size);

  var status = new Spinner(chalk.green('Recognizing speech'));

  status.start();

  speechToText.recognize(params)
    .then(response => {
      callback(null, response.result)
    })
    .catch(err => {
      callback(err)
    }).finally(() => {
      status.stop();
    });

}

function countWords(s) {
  s = s.replace(/\n/g, ' '); // newlines to space
  s = s.replace(/(^\s*)|(\s*$)/gi, ''); // remove spaces from start + end
  s = s.replace(/[ ]{2,}/gi, ' '); // 2 or more spaces to 1
  return s.split(' ').length;
}

function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

function formatSubtitles(resultsArray, casing) {
  var srtJSON = [];
  var speechEvents = [];

  for (var i = 0; i < resultsArray.results.length; ++i) {
    var result = resultsArray.results[i];

    var alternatives = result.alternatives;
    var timeStamps = alternatives[0].timestamps;
    var textItem = alternatives[0].transcript;
    var confidence = alternatives[0].confidence;

    if (confidence > 0.0) {

      // This is used to record the raw speech events 
      var event = {
        'id': 0,
        'text': '',
        'words': []
      };

      // This used for the subtitles
      var subtitle = {
        'id': '0',
        'startTime': '',
        'endTime': '',
        'text': ''
      };

      event.id = String(i + 1);
      event.text = textItem;

      /* 
      We need to do a special check to see if there are multiple words in any of
      the timeStamps. We break them up into multiple words. 
      */

      var correctedTimeStamps = [];

      for (j = 0; j < timeStamps.length; ++j) {

        if (countWords(timeStamps[j][0]) == 1) {
          correctedTimeStamps.push(timeStamps[j]);
        } else {
          // grab each word and create a separate entry
          var start = timeStamps[j][1];
          var end = timeStamps[j][2];

          var words = timeStamps[j][0].split(' ');
          for (k = 0; k < words.length; ++k) {
            correctedTimeStamps.push([words[k], start, end]);
          }
        }
      }

      event.words = correctedTimeStamps;

      subtitle.id = String(i + 1);

      if (casing === 'yes') {
        subtitle.text = capitalizeFirstLetter(textItem.trim()) + '.';
      } else {
        subtitle.text = textItem;
      }
      // The timestamps entry is an array of 3 items ['word', 'start time', 'end time']

      // Get the start time for when the first word is spoken in the segment
      subtitle.startTime = moment.duration(timeStamps[0][1], 'seconds').format('hh:mm:ss,SSS', {
        trim: false
      });
      // Get the end time for when the last word is spoken in the segment
      subtitle.endTime = moment.duration(timeStamps[timeStamps.length - 1][2], 'seconds').format('hh:mm:ss,SSS', {
        trim: false
      });

      srtJSON.push(subtitle);
      speechEvents.push(event);
    }

  }
  return ({
    'subtitles': srtJSON,
    'events': speechEvents
  });
}

(function () {
  clear();
  console.log(
    chalk.yellow(
      figlet.textSync('Subtitle Me', {
        horizontalLayout: 'full'
      })
    )
  );

  if (process.env.IBM_CLOUD_API_KEY) {
    processVideo(function (err, filename, casing) {
      if (err) {
        console.log(chalk.red("Failed to generate audio file from video"));
      } else {
        getSubtitles(process.env.IBM_CLOUD_API_KEY, filename, function (err, response) {
          if (err) {
            console.log(chalk.red('Could not extract subtitles from audio file'));
          } else {
            console.log('Generating subtitles file');

            var speechData = formatSubtitles(response, casing);
            // Take the JSON objects and write them in SRT format
            var srtSubs = parser.toSrt(speechData.subtitles);
            files.write('out/' + files.name(filename) + '.srt', srtSubs);
            console.log('Finished generating subtitles file: ' + files.name(`out/${filename}`) + '.srt');

            // Write out all the raw speech events
            files.write('out/' + files.name(filename) + '_events.json', JSON.stringify(speechData.events, null, 2));
            console.log('Finished generating speech events file: ' + 'out/' + files.name(filename) + '_events.json');
          }
        });
      }
    });
  } else {
    console.log(chalk.red('Missing credentials. Set the IBM_CLOUD_API_KEY environment variable'));
  }
})();