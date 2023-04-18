import {bfs} from './graphs.js';
import {markdown, addPlugin} from './utils.js';
import {queryEdge, CircleGraph, renderSmallEmoji} from './jspsych-CircleGraphNavigation.js';
import _ from '../../lib/underscore-min.js';
import jsPsych from '../../lib/jspsych-exported.js';

addPlugin('CircleGraphNavigationInstruction', async function(root, trial) {
  const cg = new CircleGraph(root, trial);

  await cg.navigate();
  await setTimeoutPromise(500);
  cg.el.innerHTML = ""
  await makeButton(root, "continue", {css: {'margin-top': '-600px'}})
  // await cg.endTrialScreen();

  root.innerHTML = '';
  console.log(cg.data);
  jsPsych.finishTrial(cg.data);
});
