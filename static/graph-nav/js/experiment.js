import {AdaptiveTasks} from './adaptive.js';
import {invariant, markdown, graphics, graphicsLoading, random} from './utils.js';
import {renderSmallEmoji} from './jspsych-CircleGraphNavigation.js';
import './jspsych-CircleGraphNavigationInstruction.js';
import allconfig from './configuration/configuration.js';
import {handleError, psiturk, requestSaveData, startExperiment, CONDITION} from '../../js/setup.js';
import _ from '../../lib/underscore-min.js';
import $ from '../../lib/jquery-min.js';
import jsPsych from '../../lib/jspsych-exported.js';
import {circleXY} from './graphs.js';

function formWithValidation({stimulus, validate}) {
  return {
    type: 'HTMLForm',
    validate: formData => {
      const correct = validate(formData);
      if (!correct) {
        $('fieldset').prop('disabled', true).find('label').css('opacity', 0.5);
        $('fieldset').find(':input').prop('checked', false);
        $('.validation').text('Incorrect answer. Locked for 3 seconds. Read instructions again.')
        setTimeout(() => {
          $('fieldset').prop('disabled', false).find('label').css('opacity', 1.0);
        }, 3000);
      }
      return correct;
    },
    stimulus,
  };
}

const debrief = () => [{
  type: 'survey-multi-choice',
  preamble: markdown(`
  # Experiment complete

  Thanks for participating! Please answer the questions below before
  submitting the experiment.
  `),
  button_label: 'Submit',
  questions: [
    {prompt: "Which hand do you use to write?", name: 'hand', options: ['Left', 'Right', 'Either'], required:true},
    {prompt: "In general, do you consider yourself detail-oriented or a big picture thinker?", name: 'detail-big-picture', options: ['Detail-Oriented', 'Big Picture Thinker', 'Both', 'Neither'], required:true},
    {prompt: "Did you take a picture of the map? If you did, how often did you have to look at it? Note: Your completed experiment will be accepted regardless of your answer to this question.", name: 'picture-map', options: ['Did not take picture', 'Rarely looked at picture', 'Sometimes looked at picture', 'Often looked at picture'], required:true},
    {prompt: "Did you draw the map out? If you did, how often did you have to look at it? Note: Your completed experiment will be accepted regardless of your answer to this question.", name: 'draw-map', options: ['Did not draw map', 'Rarely looked', 'Sometimes looked', 'Often looked'], required:true},
  ],
}, {
  type: 'survey-text',
  preamble: markdown(`
  # Experiment complete

  Thanks for participating! Please answer the questions below before
  submitting the experiment.
  `),
  button_label: 'Submit',
  questions: [
    {'prompt': 'What strategy did you use to navigate?',
     'rows': 2, columns: 60},
    {'prompt': 'Was anything confusing or hard to understand?',
     'rows': 2, columns: 60},
    {'prompt': 'Do you have any suggestions on how we can improve the instructions or interface?',
     'rows': 2, columns: 60},
    {'prompt': 'Any other comments?',
     'rows': 2, columns: 60}
  ]
}];

const makeSimpleInstruction = (text) => ({
  type: "SimpleInstruction",
  stimulus: markdown(text),
});

const QUERY = new URLSearchParams(location.search);

async function initializeExperiment() {
  psiturk.recordUnstructuredData('browser', window.navigator.userAgent);

  const config = await $.getJSON('static/json/test2.json');
  window.config = config
  const params = config.parameters

  params.graphRenderOptions = {
    onlyShowCurrentEdges: false,
    width: 800,
    height: 450,
    scaleEdgeFactor: 0.95,
    // fixedXY: circleXY(params.graph.states.length)
    fixedXY: circleXY(8)
  };

  // var instructions = {
  //   type: 'CircleGraphNavigationInstruction',
  //   ...params,
  //   timeline: config.trials.instruction,
  //   show_steps: false,
  //   hover_edges: false,
  //   hover_rewards: false,
  //   n_steps: 10,
  //   // trialsLength: 5,
  //   // trialsLength: configuration.graph.ordering.navigation.length,
  //   // ...configuration.graph.ordering.navigation_practice_len2[0],
  //   // graphRenderOptions: {...graphRenderOptions, onlyShowCurrentEdges: false},
  //   // onlyShowCurrentEdges,
  // };

  function instruct_block(name) {
    return {
      type: name,
      ...params,
      timeline: config.instructions[name],
    }
  }
  function practice_block(name, type, message, options={}) {
    let timeline  = config.instructions[type]
    timeline[0].first = true
    return {
      type: name,
      ...params,
      ...options,
      message,
      timeline,
    }
  }
  console.log('instruct_block("practice")', instruct_block("practice"))

  var timeline = [
    instruct_block('intro'),
    instruct_block('collect_all'),
    instruct_block('easy'),
    practice_block('practice', 'move1', `
      Let's try a few more easy ones. Try to make as many points as you can!
    `),
    practice_block('practice', 'move2', `
      OK, let's step it up a notch. Try a few two-move games.
    `),
    practice_block('practice', 'move3', `
      How about three moves?
    `),
    {
      type: 'CircleGraphNavigation',
      ...params,
      timeline: config.trials
    }
  ];

  if (location.pathname == '/testexperiment') {
    const type = QUERY.get('type');
    if (type) {
      timeline = timeline.filter(t => t.type == type);
    } else {
      // If we aren't filtering by a type, we'll cut down the number of trials per type at least.
      timeline = timeline.map(t => {
        if (t.timeline) {
          t.timeline = t.timeline.slice(0, 2);
        }
        return t;
      });
    }
    let skip = QUERY.get('skip');
    if (skip != null) {
      timeline = timeline.slice(skip);
    }
  }

  configureProgress(timeline);

  return startExperiment({
    timeline,
    show_progress_bar: true,
    auto_update_progress_bar: false,
    auto_preload: false,
    exclusions: {
      min_width: 800,
      // min_height: 600
    },
  });
}

function configureProgress(timeline) {
  let done = 0;
  function on_finish() {
    done++;
    jsPsych.setProgressBar(done/total);
    requestSaveData();
  }

  let total = 0;
  for (const entry of timeline) {
    invariant(entry.type);
    if (entry.timeline) {
      for (const subentry of entry.timeline) {
        // We don't permit recursion!
        invariant(!subentry.type);
        invariant(!subentry.timeline);
      }
      total += entry.timeline.length;
    } else {
      total++;
    }
    invariant(!entry.on_finish, 'No on_finish should be specified. This might be happening because a timeline element is being reused.');
    entry.on_finish = on_finish;
  }
}

$(window).on('load', function() {
  return Promise.all([graphicsLoading, requestSaveData()]).then(function() {
    $('#welcome').hide();
    return initializeExperiment();
  }).catch(handleError);
});

const errors = [];
function recordError(e) {
  try {
    if (!e) {
      // Sometimes window.onerror passes in empty errors?
      return;
    }
    // Since error instances seem to disappear over time (as evidenced by lists of null values), we immediately serialize them here.
    errors.push(JSON.stringify([e.message, e.stack]));
    psiturk.recordUnstructuredData('error2', JSON.stringify(errors));
    requestSaveData().catch(() => {}); // Don't throw an error here to avoid infinite loops.
  } catch(inner) {
    console.log('Error happened while recording error', inner.stack);
  }
}
window.onerror = function(message, source, lineno, colno, error) {
  console.error(message, error);
  recordError(error);
};
window.addEventListener('unhandledrejection', function(event) {
  console.error(event.reason);
  recordError(event.reason);
});
