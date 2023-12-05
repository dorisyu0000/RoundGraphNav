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
import {Bonus} from './bonus.js';

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

const QUERY = new URLSearchParams(location.search);

async function initializeExperiment() {
  psiturk.recordUnstructuredData('browser', window.navigator.userAgent);
  psiturk.recordUnstructuredData('start_time', new Date());

  const config = await $.getJSON(`static/json/config/${CONDITION+1}.json`);
  config.trials.test = {
    "graph":[[1, 2], [3, 4], [5, 6], [7], [], [], [], []],
    "rewards":[5,5,5,5,5,5,5,5],
    "start":0,
    "n_steps":-1
  }
  config.parameters.hover_edges = false
  config.parameters.hover_rewards = false

  window.config = config
  const params = config.parameters
  params.show_points = false
  params.hover_rewards = true
  params.hover_edges = true

  const bonus = new Bonus({points_per_cent: params.points_per_cent, initial: 50})

  params.graphRenderOptions = {
    onlyShowCurrentEdges: false,
    width: 700,
    height: 600,
    scaleEdgeFactor: 1,
    fixedXY: circleXY(10)
  };

  function instruct_block(name) {
    if (!_.has(config.trials, name)) throw new Error(`${name} not in config.trials`)
    return {
      name,
      bonus,
      ...params,
      type: name,
      hover_edges: false,
      hover_rewards: false,
      ...config.trials[name],
    }
  }

  function practice_block(name, message, options={}) {
    if (!_.has(config.trials, name)) throw new Error(`${name} not in config.trials`)
    return {
      name,
      ...params,
      type: 'practice',
      hover_edges: false,
      hover_rewards: false,
      ...options,
      message,
      timeline: config.trials[name],
    }
  }

  function text_block(message) {
    return {
      type: 'text',
      message: message
    }
  }

  function build_main(m) {
    return {
      name: 'main',
      type: 'main',
      bonus,
      ...params,
      timeline: config.trials.main
    }
  }

  var timeline = [
    // instruct_block('test'),
    instruct_block('intro'),
    instruct_block('collect_all'),
    instruct_block('learn_rewards'),
    // practice_block('move2',`
    //   In the real game, you get to move more than once. The number of moves
    //   for the current round is shown after you click the start button. Give
    //   it a shot!
    // `),
    // instruct_block('backstep'),
    // practice_block('practice_revealed', `
    //   Let's try a few practice rounds with more moves.
    // `),
    instruct_block('vary_transition'),
    practice_block('practice_revealed', `
      Great! Let's try a few more practice rounds.
    `),
    instruct_block('intro_hover', {
      hover_edges: true,
      hover_rewards: params.hover_rewards,
    }),
    practice_block('practice_hover', `
      Try three more practice games. Then we can begin the main section<br>
      (where you can earn money!)
    `, {
      hover_edges: true,
      hover_rewards: params.hover_rewards,
    }),
    text_block(`
      You've got it! Now you're ready to play the game for real.
      In the remaining ${config.trials.main.length} rounds, your
      score will count towards your bonus. Specifically, you'll earn
      <b>${bonus.describeScheme()}.</b> We'll start you off with ${bonus.initial}
      points for free. Good luck!
    `),
    build_main(),
    {
      type: 'survey-text',
      preamble: `
        <h2>Experiment Complete!</h2>

        Thanks for participating! Please answer the questions below before
        submitting the experiment.
      `,
      button_label: 'Submit',
      questions: [
        {'prompt': 'Did you have any difficulty with the interface? Any odd (or "buggy") behavior?',
         'rows': 2, columns: 60},
        {'prompt': 'Was any part of the instructions difficult to understand?',
         'rows': 2, columns: 60},
        {'prompt': 'Do you have any suggestions on how we can improve the instructions or interface?',
         'rows': 2, columns: 60},
        {'prompt': 'Any other comments?',
         'rows': 2, columns: 60}
      ],
      on_start() {
        psiturk.recordUnstructuredData('bonus', bonus.dollars());
      },
    }
  ];

  const name = QUERY.get('name');
  if (name) {
    while (timeline[0].name != name) {
      timeline.shift()
      invariant(timeline.length > 0)
    }
  }
  let skip = QUERY.get('skip');
  if (skip != null) {
    timeline = timeline.slice(skip);
  }

  window.timeline = timeline
  if (timeline.length <= 0) {
    throw new Error("Timeline is empty")
  }

  configureProgress(timeline);

  return startExperiment({
    timeline,
    show_progress_bar: true,
    auto_update_progress_bar: false,
    auto_preload: false,
    exclusions: {
      // min_width: 800,
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
