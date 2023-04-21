import {numString, markdown, makePromise, parseHTML, trialErrorHandling, graphicsUrl, setTimeoutPromise, addPlugin, documentEventPromise, invariant, makeButton, sleep} from './utils.js';
import _ from '../../lib/underscore-min.js'
import $ from '../../lib/jquery-min.js';
import jsPsych from '../../lib/jspsych-exported.js';
import {bfs} from './graphs.js';
import {queryEdge, CircleGraph, renderSmallEmoji} from './jspsych-CircleGraphNavigation.js';

window._ = _

function button(txt='continue', options={}) {
  return makeButton($("#cgi-top"), txt, {
    css: {'margin-top': '8px'},
    pre_delay: 0,
    // pre_delay: 2,
    post_delay: 0.2,
    ...options
  })
}

function message(html) {
  $('#cgi-msg').html(html)
}

function setup(root) {
  let top = $('<div>', {id: 'cgi-top'}).appendTo(root).css({
    'height': '120px',
    'width': '800px'
  })
  $('<p>', {id: "cgi-msg"}).appendTo(top).css('font-size', '16pt')
  $('<div>', {id: "cgi-root"}).appendTo(root)
}

addPlugin('intro', async function intro(root, trial) {
  trial = {
    ...trial,
    rewards: Array(8).fill(0)
  }
  setup(root)
  let cg = new CircleGraph($("#cgi-root"), trial);
  cg.showGraph()

  message(`Welcome! In this experiment, you will play a game on the board shown below.`)
  await button()

  message(`Your current location on the board is highlighted in blue.`)
  cg.setCurrentState(trial.start)
  await button()

  message(`You can move between locations that are connected by a line.`)
  $(cg.el).addClass('GraphNavigation-highlight-current-edge')
  await button()
  $(cg.el).removeClass('GraphNavigation-highlight-current-edge')

  message(`You move to a location by clicking on it. Try it now!`)
  console.log('cg.graph', cg.graph)
  await cg.navigate({n_steps: 1, leave_state: true})

  message(`
    The goal of the game is to earn points by collecting items from the board.<br>
    Try collecting this item!
  `)
  let goal = _.sample(cg.graph.successors(cg.state))
  // $("#gn-points").show()
  cg.setReward(goal, 10)
  console.log('goal', goal)
  await cg.navigate({n_steps: -1, goal, leave_state: true})

  message(`
    Nice! You got 10 points for collecting that item.
  `)
  await button()

  message(`
    In the non-practice games, those points will become a cash bonus!
  `)
  await button()

  message(`
    Now try collecting this item.
  `)

  goal = _.sample(cg.graph.successors(cg.state))
  cg.setReward(goal, -5)
  await cg.navigate({n_steps: -1, goal, leave_open: true})

  message(`<i>Ouch!</i> You lost 5 points for collecting that one!`)
  cg.removeGraph()
  await button()

  $(root).empty()
  jsPsych.finishTrial(cg.data)
})


addPlugin('collect_all', async function collect_all(root, trial) {
  trial = {
    ...trial,
    n_steps: -1,
  }
  setup(root)

  let vals = _.sortBy(_.without(_.keys(trial.rewardGraphics), "0"), parseFloat)
  let descriptions = vals.map(reward => {
    return `${renderSmallEmoji(trial.rewardGraphics[reward])}is worth ${reward}`
  })
  let spec = descriptions.slice(0, -1).join(', ') + ', and ' + descriptions.slice(-1)
  message(`Each kind of item is worth a different number of points:<br>` + spec)
  await button()

  message(`
    Try collecting all the items <b>(even the bad ones for now)</b>.
  `)
  let cg = new CircleGraph($("#cgi-root"), trial);
  // cg.showGraph(trial)
  await cg.showStartScreen(trial)
  await cg.navigate({
    leave_open: true,
    termination: (cg, s) => !_.some(cg.rewards)
  })

  cg.removeGraph()
  message(`
    Nice work! But in the real game, you should try to avoid the bad items.
  `)
  await button()

  $(root).empty()
  jsPsych.finishTrial(cg.data)
})


addPlugin('easy', async function easy(root, trial) {
  setup(root)
  message(`
    On each turn, you have to make some number of moves.<br>
    The number of moves for the current turn is shown after you click the start button.
  `)
  await button()

  message(`Let's start with an easy one...<br> Try to make as many points as you can in just one move!`)
  let cg = new CircleGraph($("#cgi-root"), trial);

  $("#GraphNavigation-steps").html(trial.n_steps)
  await cg.showStartScreen(trial)

  await cg.navigate() // {leave_open: true}

  if (cg.score == trial.max_val) {
    message("Awesome! That was the most points you could have made.")
    // $(cg.el).animate({opacity: 0.2}, 300);

  } else {
    message(`Hmm... you should be able to make ${trial.max_val} points. Why don't we try again?`)
    cg.logger('try_again')
    $(cg.el).animate({opacity: 0.2}, 300);
    await button("reset")

    message(`Hint: the ${renderSmallEmoji(trial.rewardGraphics[10])} is worth the most!`)
    $(cg.el).animate({opacity: 1}, 100);
    cg.setScore(0)
    cg.loadTrial(trial)
    await cg.navigate() // {leave_open: true}

    // $(cg.el).animate({opacity: 0.2}, 300);
    if (cg.score == trial.max_val) {
      message("That's more like it! Well done!")
    } else {
      message("Not quite, but let's move on for now.")
    }
  }
  cg.removeGraph()
  await button()

  $(root).empty()
  jsPsych.finishTrial(cg.data)
});

addPlugin('practice', async function practice(root, trial) {
  setup(root)
  message(trial.message)
  // if (trial.first) await button()

  cg = new CircleGraph($("#cgi-root"), trial);
  await cg.showStartScreen(trial)
  await cg.navigate()
  $(root).empty()
  jsPsych.finishTrial(cg.data)
})

addPlugin('learn_rewards', async function learn_rewards(root, info) {
  setup(root)
  message(`Lets try a few more easy ones. Try to collect the best item!`)

  for (const trial_set of info.trial_sets) {
    for (let trial of trial_set) {
      console.log('trial', trial)
      trial = {...info, ...trial, show_steps: false}
      cg = new CircleGraph($("#cgi-root"), trial);
      await cg.showGraph()
      await cg.navigate()
      $(cg.wrapper).remove()
    }
  }
  // jsPsych.data.write(data);
  // psiturk.recordTrialData(data)

  // cg = new CircleGraph($("#cgi-root"), trial);
  // await cg.showStartScreen(trial)
  // await cg.navigate()
  // $(root).empty()
  // jsPsych.finishTrial(cg.data)
})



addPlugin('intro_hover', async function intro_hover(root, trial) {
  setup(root)
  message("Just one more thing...")
  await button()

  message("So far we've been showing you all the items and connections.")
  cg = new CircleGraph($("#cgi-root"), trial);
  cg.showGraph()
  cg.setCurrentState(trial.start)
  await button()

  message("But in the real game, they're hidden!")
  await sleep(1000)
  $(".State > img").animate({'opacity': 0}, 1000)
  $(".GraphNavigation-edge").animate({'opacity': 0}, 1000)
  await sleep(1300)

  await button()

  message(`
    You can reveal the item and connections at a location by hovering over it.<br>
    <b>Hover over every location to continue.</b>
  `)
  cg.el.classList.add('hideStates')
  cg.el.classList.add('hideEdges')
  $(".State > img").css({'opacity': ''})
  $(".GraphNavigation-edge").css({'opacity': ''})
  cg.setupMouseTracking()

  let {promise, resolve} = makePromise();

  let setEqual = (xs, ys) => xs.size === ys.size && [...xs].every((x) => ys.has(x));
  let hovered = new Set()
  let all_states = new Set(cg.graph.states)
  let done = false

  cg.logger_callback = (event, info) => {
    if (event == 'mouseenter') {
      hovered.add(info.state)
      window.hovered = hovered
      window.all_states = all_states
      if (setEqual(hovered, all_states)) {
        done = true
        resolve()
      }
    }
  }
  sleep(15000).then(() => {
    if (done) return
  message(`
    <b>Hover over every location to continue.</b><br>
    <i>Your current location counts too!</i>
  `)
  })
  await promise

  message(`
    You still move around by clicking on a location.<br>
    <b>Collect all the items to continue</b>.
  `)
  cg.options.hover_edges = cg.options.hover_rewards = true
  await cg.navigate({
    n_steps: -1,
    termination: (cg, s) => !_.some(cg.rewards)
  })

  $(root).empty()
  jsPsych.finishTrial(cg.data)
})

addPlugin('text', async function text(root, trial) {
  setup(root)
  message(trial.message)
  await button()
  $(root).empty()
  jsPsych.finishTrial({})
})
