#!/usr/bin/env osascript -l JavaScript

/**
 * Delete silence from Final Cut Pro timeline using a script.
 * Demo: https://imgur.com/a/Zisav
 *
 * This script accepts an ffmpeg silencedetect log as input.
 *
 * To setup, have fcp running along with your clip selected. Ensure that the
 * timecode will start at zero before running this script. That is, if your clip
 * is in the middle of your project, create a compound clip first and then enter
 * into that clip before running this script.
 *
 * To generate silence.txt:
 *     /usr/local/bin/ffmpeg -i $1 -af silencedetect=n=-50dB:d=1 -f s16le -y /dev/null 2>&1 | tee silence.txt
 *
 * Currently it adds a little margin of silence at the end of each noised clip. You can adjust this below.
 * If you adjust the silencedetection dB, then this number may need tweaking.
 *
 * For example, if your dB filter is higher, you'll filter out more background
 * noise, but you might clip the audio you want. Extending the margins can help
 * prevent clipping a natural trailing off of the sound you want.
 *
 * Nate Murray 2017 <nate@natemurray.com>
 **/
function run(argv) {
  ObjC.import("stdlib");
  ObjC.import("Foundation");

  console.log(JSON.stringify(argv));
  console.log("Start Final Cut Pro and click the matching clip");

  // Adjust these to your liking
  // One way to test, is comment out the delete section below and visually inspect
  const startMargin = 0.100;
  const endMargin = 0.000;

  if (!Application("Final Cut Pro").running()) {
    console.log("Final Cut Pro isn't running");
    $.exit(1);
  }

  // let app = Application("Finder");
  let app = Application.currentApplication();
  app.includeStandardAdditions = true;
  let se = Application("System Events");

  function loadFile(path) {
    let fm = $.NSFileManager.defaultManager;
    let contents = fm.contentsAtPath(path.toString()); // NSData
    contents = $.NSString.alloc.initWithDataEncoding(
      contents,
      $.NSUTF8StringEncoding
    );
    return ObjC.unwrap(contents);
  }

  function parseSilenceFile(contents) {
    let lines = contents.split("\n");

    let silences = [];
    let pair = {};

    for (let i = 0; i < lines.length; i++) {
      let l = lines[i];
      // [silencedetect @ 0x7fd895407da0] silence_start: 272.972
      // [silencedetect @ 0x7fd895407da0] silence_end: 274.762 | silence_duration: 1.78948
      let startReg = /silence_start: (\d+.?\d+)\b/;
      let endReg = /silence_end: (\d+.?\d+)\b/;

      let startMatch = startReg.exec(l);
      let endMatch = endReg.exec(l);

      if (startMatch && startMatch.length > 0) {
        pair["start"] = startMatch[1];
        pair["end"] = null;
      }
      if (endMatch && endMatch.length > 0) {
        pair["end"] = endMatch[1];
        if (pair["start"]) {
          (pair => silences.push(pair))(pair);
          pair = {};
        }
      }
    }

    return silences;
  }

  // parse the silence points
  let path = argv[0];
  let rawSilenceFileContents = loadFile(path);
  let silencePoints = parseSilenceFile(rawSilenceFileContents);
  console.log(JSON.stringify(silencePoints));

  // activate fcp
  let fcp = Application("Final Cut Pro");
  fcp.activate();
  delay(1.0);

  function moveToTimecode(timeInSeconds) {
    delay(0.2);

    // convert timeInSeconds in decimal to timecode values.
    let [seconds, deciseconds] = timeInSeconds.split(".");

    let d = new Date(null);
    d.setSeconds(parseInt(seconds));
    let hourmindays = d.toISOString().substr(11, 8);
    let decipart = (60 * parseFloat("0." + deciseconds))
      .toString()
      .split(".")[0]
      .substr(0, 2);

    if (decipart.length < 2) {
      decipart = "0" + decipart;
    }

    let timecodekeystroke = (hourmindays + decipart).replace(/:/g, "");
    console.log(
      "  timecodekeystroke ",
      timeInSeconds,
      hourmindays,
      decipart,
      timecodekeystroke
    );

    se.keystroke("p", { using: "control down" });
    se.keystroke(timecodekeystroke);
    se.keyCode(36); // Press Enter
  }

  function blade() {
    se.keystroke("b", { using: "command down" });
  }

  // extend edges
  silencePoints = silencePoints.map(sp => ({
    start: (parseFloat(sp.start) + startMargin).toString(),
    end: (parseFloat(sp.end) - endMargin).toString()
  }));

  for (let i = 0; i < silencePoints.length; i++) {
    let sp = silencePoints[i];
    console.log(i, JSON.stringify(sp));

    delay(0.05);
    moveToTimecode(sp.start);
    delay(0.05);
    blade();
    delay(0.05);
    moveToTimecode(sp.end);
    delay(0.05);
    blade();
  }

  console.log("Deleting Silence");
  // Go backwards, becase we're changing the total time as we go
  for (let i = silencePoints.length - 1; i > 0; i--) {
    let sp = silencePoints[i];
    console.log("D", i, JSON.stringify(sp));
    moveToTimecode(sp.start);
    delay(0.1);

    // select current clip
    se.keystroke("c");
    delay(0.1);

    // delete the silence
    se.keyCode(51); // Press Delete
    delay(0.3);
  }
}
