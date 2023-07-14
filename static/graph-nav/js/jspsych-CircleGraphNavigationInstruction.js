import {numString, markdown, makePromise, parseHTML, trialErrorHandling, graphicsUrl, setTimeoutPromise, addPlugin, documentEventPromise, invariant, makeButton, sleep} from './utils.js';
import _ from '../../lib/lodash-min.js';
import $ from '../../lib/jquery-min.js';
import jsPsych from '../../lib/jspsych-exported.js';
import {bfs} from './graphs.js';
import {queryEdge, CircleGraph, renderSmallEmoji} from './jspsych-CircleGraphNavigation.js';
import {psiturk} from '../../js/setup.js';

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
    Try collecting this 4!
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
    <i>Ouch!</i> You lost 4 points for collecting that one!<br>
    (<span class="win">green</span> is good and <span class="loss">red</span> is bad)
  `)
  cg.removeGraph()
  await button()

  $(root).empty()
  jsPsych.finishTrial(cg.data)
})

let ensureSign = x => x > 0 ? "+" + x : "" + x

function describeRewards(rewardGraphics) {
  let vals = _.sortBy(_.without(_.keys(rewardGraphics), "0"), parseFloat)
  // let descriptions = vals.map(reward => {
  //   return `${renderSmallEmoji(rewardGraphics[reward])}is worth ${reward}`
  // })
  // return descriptions.slice(0, -1).join(', ') + ', and ' + descriptions.slice(-1)

  let vv =  vals.map(reward => `
    <div class="describe-rewards-box">
    ${renderSmallEmoji(rewardGraphics[reward])}<br>
    ${ensureSign(reward)}
    </div>
  `).join("")
  return `
    <div class="describe-rewards">
      ${vv}
    </div>
  `
}

addPlugin('collect_all', async function collect_all(root, trial) {
  trial = {
    ...trial,
    n_steps: -1,
  }
  setup(root)

  message(
    `Each kind of item is worth a different number of points:
    ${describeRewards(trial.rewardGraphics)}
  `)
  await button()

  message(`
    Try collecting all the items <b>(even the bad ones for now)</b>.
    ${describeRewards(trial.rewardGraphics)}
  `)
  let cg = new CircleGraph($("#cgi-root"), trial);
  cg.showGraph(trial)
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

addPlugin('learn_rewards', async function learn_rewards(root, info) {
  setup(root)
  let stage = $('<div>').appendTo(root)
  let attempt = 0

  for (let trial_set of info.trial_sets) {
    attempt += 1
    if (attempt == 1) {
      message(`
        Before we play the full game, let's do some pratice to make<br>
        sure you know what each item is worth.<br>
        ${describeRewards(info.rewardGraphics)}
      `)
    } else {
      message(`
        You didn't always pick the best item on that round. Let's try again.<br>
        ${describeRewards(info.rewardGraphics)}
      `)
      await button()
      message(`Try to collect the best item! We'll continue when you always pick the best one.`)
    }
    await button()
    let n_correct = 0
    for (let choices of trial_set) {
      message(`Pick the better item.`)
      let choice = await new Promise((resolve, reject) => {
        choices.forEach(r => {
          let graphic = info.rewardGraphics[r]
          let choice_div = $('<div>')
          .css('display', 'inline-block')
          .appendTo(stage)

          $('<button>')
          .addClass('reward-button')
          .addClass(r == _.max(choices) ? 'correct-button' : 'incorrect-button')
          .appendTo(choice_div)
          .css({margin: '0px 20px 0px 20px', border: 'thick black solid', 'border-radius': 10})
          .append($('<img>', {src: graphicsUrl(graphic), width: 200}))
          .click(() => {
            console.log("click!")
            resolve(r)
          })

          $('<span>')
          .addClass('reward-feedback')
          .html(`<br>${ensureSign(r)}`)
          .appendTo(choice_div)
          .css({'font-size': 40, 'font-weight': 'bold'})
          .hide()
        })
      })

      let correct = (choice == _.max(choices))
      $('.incorrect-button').css('opacity', .2)
      $('.reward-feedback').show()
      $('.reward-button').off("click").css('cursor', 'default')
      if (correct) {
        message(`That's right!`)
      } else {
        message(`Actually, the other one is better. <b>Please fix your choice.</b>`)
        let {promise, resolve} = makePromise()
        $('.correct-button')
        .css('cursor', 'pointer')
        .click(() => resolve())
        await promise
        $('.correct-button').css('border', 'thick green solid')
        message(`Much better!`)
      }
      await sleep(1000)
      stage.empty()
      n_correct += correct
      console.log('choice', choice, n_correct)

      let data = {trial_type: 'learn_rewards', choices, choice, attempt}
      jsPsych.data.write(data);
      psiturk.recordTrialData(data)
    }
    if (n_correct == trial_set.length) {
      message(`Great job! It looks like you've figured out which items are best.`)
      await button()
      jsPsych.finishTrial({'trial_type': 'dummy', 'flag': 'dummy'})
      return
    }
  }
  // exhausted all the trial sets!
  message(`
    <b>It seems like you are having a hard time understanding the game.
    Please submit your assignment without a completion code and send
    us a message on Prolific explaining what happened.</b>
  `)
  $('#cgi-msg').css('margin-top', 200)
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

addPlugin('backstep', async function backstep(root, trial) {
  setup(root)
  message("Keep in mind: You can always move back to your previous location.")

  while (true) {
    let cg = new CircleGraph($("#cgi-root"), trial);
    await cg.showGraph()

    let best = _.max(cg.graph.successors(cg.options.start).map(s => trial.rewards[s]))
    console.log('this', cg.score, best)
    await cg.navigate()
    if (cg.score == best) {
      break
    } else {
      message(`
        Hmm... You should be able to make ${best} points on this round.<br>
        <b>Remember, you can go back to where you started!</b>
      `)
      cg.logger('try_again')
      $(cg.wrapper).remove()
      jsPsych.data.write(cg.data);
      psiturk.recordTrialData(cg.data)
      await button("try again")
    }
  }

  message("Awesome! You avoided the bad item by going back to your starting location.")
  await button()

  $(root).empty()
  jsPsych.finishTrial(cg.data)


  await cg.navigate()
  $(root).empty()
  jsPsych.finishTrial(cg.data)

})

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
  message("Just one more thing...")
  await button()

  let hidden_things = [
    trial._rewards && "points",
    trial._edges && "connections"
  ].filter(x=>x).join(" and ")

  message(`So far we've been showing you all the ${hidden_things}`)
  cg = new CircleGraph($("#cgi-root"), trial);
  cg.showGraph()
  cg.setCurrentState(trial.start)
  await button()

  message("But in the real game, they're hidden!")
  await sleep(500)

  trial._rewards && $(".GraphReward").animate({'opacity': 0}, 1000)
  trial._edges && $(".GraphNavigation-edge").animate({'opacity': 0}, 1000)
  trial._edges && $(".GraphNavigation-arrow").animate({'opacity': 0}, 1000)
  await sleep(1000)

  cg.options.hover_rewards = trial._rewards
  cg.options.hover_edges = trial._edges
  cg.setupMouseTracking()
  $(".GraphReward").css({'opacity': ''})
  $(".GraphNavigation-edge").css({'opacity': ''})
  $(".GraphNavigation-arrow").css({'opacity': ''})
  await sleep(1000)
  await button()

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

  message(`You can show the item at that location by clicking on it. Try it out!`)
  cg.highlight(s2)
  await cg.clickState(s2)
  message(`Thats it!`)

  cg.unhighlight(s2)
  cg.showState(s2)
  await button()

  message('Keep clicking where the arrow points to see more of the board.')
  cg.hideState(s2)
  cg.hideEdge(s1, s2)
  await cg.showForcedHovers(1)
  message(`Your current location will turn back to blue when it's time to select your moves.`)
  await button()
  message(`Good luck!`)
  cg.options.expansions = []
  await cg.navigate()

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

addPlugin('check_camera', async function check_camera(root, trial) {
  setup(root)
  message(`
    Thanks for participating in our experiment! This experiment involves an eye-tracking
    component, so we need to confirm that we can access your webcam before
    we continue. Make sure you click "Allow" when the notification pops up!
  `)

  await button('Allow webcam')
  try {
    let stream = await navigator.mediaDevices.getUserMedia({video: true, audio: false})
    stream.getTracks().forEach(function(track) {
      track.stop();
    });
  } catch {
    message(`
      It looks like you didn't give access. Unfortunately, you can only participate
      in this experiment if can use your webcam to record your eyes. If you meant
      to allow webcam access, try refreshing the page.
    `)
  }
  message(`
    Great! We won't actually use your webcam until the last section of the experiment.
  `)
  await button()
  $(root).empty()
  jsPsych.finishTrial({})
})

addPlugin('setup_eyetracking', async function setup_eyetracking(root, trial) {
  setup(root)
  message(markdown(`

    For the last ${trial.n_trial} rounds, we're going to
    record what you look at using your webcame ("eye-tracking").
    This will help us understand how you're deciding which locations to visit.

    We will get the best data if you keep your head still.
    <b>If you want to take a break, please do so now! </b>
    The eye-tracking phase will last
    ${trial.n_trial} rounds, and we hope that you
    can stay at your computer until you finish them.
  `))
  await button()

  await new Promise((resolve, reject) => {
    GazeCloudAPI.APIKey = "X2E4vLlucLEvVbuM5VR76y3"
    GazeCloudAPI.StartEyeTracking()
    GazeCloudAPI.OnCalibrationComplete = function(){
      resolve()
    }
    GazeCloudAPI.OnCamDenied = function(){
      reject('camera access denied')
    }
    GazeCloudAPI.OnError = function(msg){ console.log('err: ' + msg) }
  })
  sleep(1000 * 60 * 60).then(() => GazeCloudAPI.StopEyeTracking())
  jsPsych.finishTrial({})
})

addPlugin('calibration', async function calibration(root, trial) {
  setup(root)
  message(`
    Please click on each location when it is highlighted.<br>
    <b>Make sure you are looking at the location when you click it!</b>
  `)

  let cg = new CircleGraph($("#cgi-root"), trial);
  cg.showGraph()

  for (let s of _.shuffle(cg.graph.states)) {
    cg.highlight(s)
    await new Promise((resolve, reject) => {
      $(`.GraphNavigation-State-${s}`)
      .css('cursor', 'pointer')
      .click(resolve)
    })
    cg.unhighlight(s)
    $(`.GraphNavigation-State-${s}`).css('cursor', 'default')
  }
  $(root).empty()
  jsPsych.finishTrial(cg.data)
})