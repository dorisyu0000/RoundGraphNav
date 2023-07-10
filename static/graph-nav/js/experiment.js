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
  console.log('Jun 2, 2023 11:56:17 AM')

  const config = await $.getJSON(`static/json/config/${CONDITION+1}.json`);
  // config.trials.test = config.trials.main[1]
  const bonused_rounds = config.trials.main.length +
    (config.trials.eyetracking ?? []).length
  console.log('bonused_rounds', bonused_rounds)

  window.config = config
  const params = config.parameters
  params.show_points = false

  const bonus = new Bonus({points_per_cent: params.points_per_cent, initial: 50})

  params.graphRenderOptions = {
    onlyShowCurrentEdges: false,
    width: 600,
    height: 600,
    // width: 800,
    // height: 800,
    scaleEdgeFactor: 1,
    fixedXY: circleXY(config.trials.intro.graph.length)
  };

  function bare_block(name, options={}) {
    return {name, type: name, ...params, ...options}
  }

  function instruct_block(name, options={}) {
    console.log('instruct', name, options)
    if (!_.has(config.trials, name)) throw new Error(`${name} not in config.trials`)
    return {
      name,
      bonus,
      type: name,
      ...params,
      hover_edges: options.enable_hover ? params.hover_edges : false,
      hover_rewards: options.enable_hover ? params.hover_rewards : false,
      ...options,
      ...config.trials[name],
    }
  }

  function practice_block(name, message, options={}) {
    if (!_.has(config.trials, name)) throw new Error(`${name} not in config.trials`)
    return {
      name,
      message,
      type: 'practice',
      ...params,
      hover_edges: options.enable_hover ? params.hover_edges : false,
      hover_rewards: options.enable_hover ? params.hover_rewards : false,
      ...options,
      timeline: config.trials[name],
    }
  }

  function text_block(message) {
    return {
      type: 'text',
      message: message
    }
  }

  function main_block(name='main', options={}) {
    if (!_.has(config.trials, name)) throw new Error(`${name} not in config.trials`)

    return {
      name,
      bonus,
      ...params,
      type: 'main',
      ...options,
      timeline: config.trials[name],
    }
  }


  var timeline = [
    // instruct_block('test', {enable_hover: true}),
    config.trials.eyetracking && bare_block('check_camera'),
    // instruct_block('test'),
    instruct_block('intro'),
    instruct_block('collect_all'),
    instruct_block('learn_rewards'),
    // instruct_block('backstep'),
    params.use_n_steps && practice_block('move2',`
      In the real game, you get to move more than once. The number of moves
      for the current round is shown after you click the start button. Give
      it a shot!
    `),
    params.vary_transition && instruct_block('vary_transition'),
    practice_block('practice_revealed', `
      Let's try a few practice rounds with more moves.
    `),
    (params.hover_rewards || params.hover_edges) && instruct_block('intro_hover', {
      _edges: params.hover_edges,
      _rewards: params.hover_rewards,
    }),
    text_block(`
      You've got it! Now you're ready to play the game for real.
      In the remaining ${bonused_rounds} rounds, your
      score will count towards your bonus. Specifically, you'll earn
      <b>${bonus.describeScheme()}.</b> We'll start you off with ${bonus.initial}
      points for free. Good luck!
    `),
    main_block(),
    config.trials.eyetracking && bare_block('setup_eyetracking', {
      n_trial: config.trials.eyetracking.length
    }),
    config.trials.eyetracking && instruct_block('calibration'),
    config.trials.eyetracking && main_block('eyetracking'),
    config.trials.eyetracking && instruct_block('calibration'),
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
  ].filter(x=>x)  // skip the falses


  const name = QUERY.get('name');
  if (name) {
    while (timeline[0].name != name) {
      timeline.shift()
      if (timeline.length <= 0) throw new Error("Timeline is empty")
    }
  }
  let skip = QUERY.get('skip');
  if (skip != null) {
    timeline = timeline.slice(skip);
  }

  window.timeline = timeline
  if (timeline.length <= 0) throw new Error("Timeline is empty")

  configureProgress(timeline);
  // timeline.splice(0, 0, {type: 'fullscreen', fullscreen_mode: true})

  return startExperiment({
    timeline,
    show_progress_bar: false,
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
    // jsPsych.setProgressBar(done/total);
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
