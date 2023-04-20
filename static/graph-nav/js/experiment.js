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

  const config = await $.getJSON('static/json/test2.json');

  window.config = config
  const params = config.parameters
  // params.show_steps = false
  params.show_points = false

  const bonus = new Bonus({points_per_cent: params.points_per_cent, initial: 50})
  // window.bonus = bonus
  // bonus.addPoints(10)

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
    if (!_.has(config.trials, name)) throw new Error(`${name} not in config.trials`)
    return {
      ...params,
      type: name,
      hover_edges: false,
      hover_rewards: false,
      timeline: config.trials[name],
    }
  }
  function practice_block(name, message, options={}) {
    if (!_.has(config.trials, name)) throw new Error(`${name} not in config.trials`)
    return {
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
      type: 'main',
      bonus,
      ...params,
      timeline: config.trials.main
    }
  }


  var timeline = [
    instruct_block('intro'),
    instruct_block('collect_all'),
    instruct_block('easy'),
    practice_block('move1', `
      Let's try a few more easy ones. Try to make as many points as you can!
    `),
    practice_block('move2', `
      OK, let's step it up a notch. Try a few two-move games.
    `),
    practice_block('move3', `
      How about three moves?
    `),
    practice_block('vary_transition', `
      So far we've been playing with one set of connections (lines).<br>
      But in the real game, the connections change on every round.
    `),
    instruct_block('intro_hover'),
    practice_block('practice_hover', `
      Try three more practice games. Then we can begin the main section<br>
      (where you can earn money!)
    `, {
      hover_edges: true,
      hover_rewards: true,
    }),
    text_block(`
      You've got it! Now you're ready to play the game for real.
      In the remaining ${config.trials.main.length} rounds, your
      score will count towards your bonus. Specifically, you'll earn
      <b>${bonus.describeScheme()}.</b> We'll start you off with ${bonus.initial}
      points for free. Good luck!
    `),
    build_main()
  ];

  if (location.pathname == '/testexperiment') {
    const type = QUERY.get('type');
    if (type) {
      timeline = timeline.filter(t => t.type == type);
    } else {
      // // If we aren't filtering by a type, we'll cut down the number of trials per type at least.
      // timeline = timeline.map(t => {
      //   if (t.timeline) {
      //     t.timeline = t.timeline.slice(0, 3);
      //   }
      //   return t;
      // });
    }
    let skip = QUERY.get('skip');
    if (skip != null) {
      timeline = timeline.slice(skip);
      console.log('timeline', timeline)
    }
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
