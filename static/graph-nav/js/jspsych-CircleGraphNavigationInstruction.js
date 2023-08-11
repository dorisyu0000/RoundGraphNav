import {getKeyPress, numString, markdown, makePromise, parseHTML, trialErrorHandling, graphicsUrl, setTimeoutPromise, addPlugin, documentEventPromise, invariant, makeButton, sleep} from './utils.js';
import _ from '../../lib/lodash-min.js';
import $ from '../../lib/jquery-min.js';
import jsPsych from '../../lib/jspsych-exported.js';
import {bfs} from './graphs.js';
import {queryEdge, CircleGraph, renderSmallEmoji} from './jspsych-CircleGraphNavigation.js';
import {psiturk} from '../../js/setup.js';

window._ = _

const FAST_MODE = (new URLSearchParams(location.search)).get('fast') && true

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

addPlugin('test', async function test(root, trial) {
  setup(root)
  console.log('this is test', trial)
  // trial.hover_edges = true
  // trial.hover_rewards = true
  message(trial.message)
  // if (trial.first) await button()

  // trial.force_hover = [0, 1, 2, 3, 4]
  cg = new CircleGraph($("#cgi-root"), trial);
  // await cg.showStartScreen(trial)
  cg.showGraph()
  await cg.navigate()
  $(root).empty()
  jsPsych.finishTrial(cg.data)
})

addPlugin('intro', async function intro(root, trial) {
  setup(root)
  trial.n_steps = -1
  let cg = new CircleGraph($("#cgi-root"), trial);
  cg.showGraph()

  message(`Welcome! In this experiment, you will play a game on the board shown below.`)
  await button()

  message(`Your current location on the board is highlighted in blue.`)
  cg.setCurrentState(trial.start)
  await button()

  message(`You can move by clicking on a location that has an arrow pointing<br>from your current location. Try it now!`)
  let next_states = cg.graph.successors(trial.start)
  for (const s of next_states) {
    $(`.GraphNavigation-State-${s}`).addClass('GraphNavigation-State-Highlighted')
  }

  console.log('cg.graph', cg.graph)
  await cg.navigate({n_steps: 1, leave_state: true})
  $(`.GraphNavigation-State`).removeClass('GraphNavigation-State-Highlighted')

  message(`
    The goal of the game is to collect points on the board.<br>
    Try collecting this +4!
  `)
  let goal = _.sample(cg.graph.successors(cg.state))
  // $("#gn-points").show()
  cg.setReward(goal, 4)
  console.log('goal', goal)
  await cg.navigate({n_steps: -1, goal, leave_state: true})

  message(`
    In the non-practice games, those points will become a cash bonus!<br>
    (${trial.bonus.describeScheme()})
  `)
  await button()

  message(`
    Now try collecting this one.
  `)

  goal = _.sample(cg.graph.successors(cg.state))
  cg.setReward(goal, -4)
  await cg.navigate({n_steps: -1, goal, leave_open: true})

  message(`
    <i>Ouch!</i> You lost 4 points for collecting that one!
  `)
    // <br>
    // (<span class="win">green</span> is good and <span class="loss">red</span> is bad)
  cg.removeGraph()
  await button()

  $(root).empty()
  jsPsych.finishTrial(cg.data)
})

let ensureSign = x => x > 0 ? "+" + x : "" + x

addPlugin('vary_transition', async function vary_transition(root, trial) {
  setup(root)
  message(`
    Both the connections and points change on every round of the game.
  `)
  cg = new CircleGraph($("#cgi-root"), trial);
  cg.showGraph()
  cg.setCurrentState(trial.start)
  await button()

  message(`
    When you get to a location with no outgoing connections, the round ends.<br>
  `)
  let terminal = _.keys(_.pickBy(cg.graph._adjacency, _.isEmpty))
  for (const s of terminal) {
    cg.highlight(s)
  }
  await button()
  for (const s of terminal) {
    cg.unhighlight(s)
  }

  message(`
    Try to make as many points as you can!
  `)
  await cg.navigate()
  $(root).empty()
  jsPsych.finishTrial(cg.data)
})

addPlugin('intro_hover', async function intro_hover(root, trial) {
  setup(root)
  window.trial = trial
  message("Just one more thing...")
  FAST_MODE || await button()

  let hidden_things = [
    trial._rewards && "points",
    trial._edges && "connections"
  ].filter(x=>x).join(" and ")

  message(`So far we've been showing you all the ${hidden_things}`)
  cg = new CircleGraph($("#cgi-root"), trial);
  cg.showGraph()
  cg.setCurrentState(trial.start)
  FAST_MODE || await button()

  message("But in the real game, they're hidden!")

  if (!FAST_MODE) { // animated hiding
    await sleep(500)
    trial._rewards && $(".GraphReward").animate({'opacity': 0}, 800)
    trial._edges && $(".GraphNavigation-edge").animate({'opacity': 0}, 800)
    trial._edges && $(".GraphNavigation-arrow").animate({'opacity': 0}, 800)
    await sleep(1000)
  }
  cg.options.hover_rewards = trial._rewards
  cg.options.hover_edges = trial._edges
  cg.setupMouseTracking()
  $(".GraphReward").css({'opacity': ''})
  $(".GraphNavigation-edge").css({'opacity': ''})
  $(".GraphNavigation-arrow").css({'opacity': ''})

  await button()

  if (trial.forced_hovers) {
    // FORCED HOVER
    message(`On each round, we will show you parts of the board, one at a time.`)
    await button()

    message(`Your current location will turn pink during this phase of the game.`)
    $(cg.el).addClass('forced-hovers')
    await button()

    message(`For example, here is one location you could move to from your initial location.`)
    // let hover = cg.showForcedHovers(0, 1)
    let [s1, s2] = trial.expansions[0]
    cg.showEdge(s1, s2)
    await button()

    message(`Press any key to reveal the number of points at that location.`)
    // cg.highlight(s2)
    await getKeyPress()
    message(`Thats it!`)

    cg.unhighlight(s2)
    cg.showState(s2)
    await button()

    message('Keep pressing a key to see more of the board.')
    cg.hideState(s2)
    cg.hideEdge(s1, s2)
    await cg.showForcedHovers(1)
    message(`Your current location will turn back to blue when it's time to select your moves.`)
    await button()
    message(`Good luck!`)
    cg.options.expansions = []
    await cg.navigate()
  } else {
    // FREE HOVER
    message(`
      You can reveal the ${hidden_things} by hovering over different locations.<br>
      Hover over every location to continue.
    `)
    cg.options.hover_rewards = trial._rewards
    cg.options.hover_edges = trial._edges
    cg.setupMouseTracking()

    // trial._rewards && cg.el.classList.add('hideStates')
    // trial._edges && cg.el.classList.add('hideEdges')

    $(".State > img").css({'opacity': ''})
    $(".GraphNavigation-edge").css({'opacity': ''})
    $(".GraphNavigation-arrow").css({'opacity': ''})

    let {promise, resolve} = makePromise();

    let setEqual = (xs, ys) => xs.size === ys.size && [...xs].every((x) => ys.has(x));
    let hovered = new Set()
    let all_states = new Set(cg.graph.states)
    let done = false


    let terminal = _.keys(_.pickBy(cg.graph._adjacency, _.isEmpty))
    trial.terminal = terminal
    cg.logger_callback = (event, info) => {
      if (!done && event == 'mouseenter') {
        hovered.add(info.state)
        console.log('callback', String(info.state))
        if (trial.show_successor_rewards) {
          if (terminal.includes(String(info.state))) {
            message(`
              If nothing appears, it means that location has no outgoing connections.
              <br>
              Hover over every location to continue.
            `)
          } else {
            message(`
              Hovering a location shows its outgoing connections.
              <br>
              Hover over every location to continue.
            `)
          }
        }
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
      Try to get as many points as you can!
    `)
    await cg.navigate()
  }

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