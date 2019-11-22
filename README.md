# subtitle-me

Subtitle generator for videos using IBM Watson Speech to Text

This is a program written in Node.js used to generate a [SubRip](https://en.wikipedia.org/wiki/SubRip) `.srt` file from an `.mp4` video by using the [IBM Watson Speech to Text](https://www.ibm.com/watson/services/speech-to-text/) service on [IBM Cloud](https://www.ibm.com/cloud/why-ibm/).

>English is currently the only supported language

## Prerequistes

You need to have Node.js installed on your machine. If you don't have Node.js, then you can download it from [nodejs.org](https://nodejs.org). We use the latest Node LTS version, Node 10.

In order to be able to use this program, make sure you have [ffmpeg](http://www.ffmpeg.org) installed on your system (including all necessary encoding libraries such as libmp3lame or libx264).

This project relies on the [fluent-ffmpeg](https://github.com/fluent-ffmpeg/node-fluent-ffmpeg) package, which requires that you have a `ffmpeg` version greater than 0.9. The fluent-ffmpeg package will call `ffmpeg` and `ffprobe` so you need to have these in your `PATH` or set in the `FFMPEG_PATH` environment variable and the `FFPROBE_PATH` environment variable. This program will automatically convert your file to a .mp3 file so you must have the `libmp3lame` codec installed on your system.

You must also create an [IBM Cloud](https://cloud.ibm.com/registration) account and create service instances for [Watson Speech to Text](https://www.ibm.com/cloud/watson-speech-to-text).

## Usage

Set the `IBM_CLOUD_API_KEY` environment variable in your terminal to your Speech to Text API key from IBM Cloud.

Use [npx](https://github.com/npm/npx) to run this program without cloning the repository and installing dependencies. It ships with NPM so no need to install.

### MacOS and Linux

```sh
IBM_CLOUD_API_KEY=your-api-key npx subtitle-me
```

### Windows

```sh
set IBM_CLOUD_API_KEY=your-api-key npx subtitle-me
```

You can indicate whether or not sentence casing should be performed. By default `subtitle-me` will capitalize the first letter in the first word of a subtitle and add a period to the end of the subtitle. 

Once the command has executed, it will create a file named the same as the video filename except with the `.srt` extension. A raw speech events file will also be created and has the same name as the video file except it will append on `_events.json`. Additionally, an .mp3 file will be created that contains the extracted audio from the video file. It will be named the same as the video filename except that it will end in `.mp3`.
