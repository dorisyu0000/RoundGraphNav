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

addPlugin('test', async function intro(root, trial) {
    setup(root)
    message(trial.message)
    trial.hover_edges = true
    trial.hover_rewards = true
    // if (trial.first) await button()

    cg = new CircleGraph($("#cgi-root"), trial);
    console.log(trial)
    cg.showGraph()
    await cg.navigate()
    $(root).empty()
    jsPsych.finishTrial(cg.data)
})


addPlugin('intro', async function intro(root, trial) {
  setup(root)
  let cg = new CircleGraph($("#cgi-root"), trial);
  cg.showGraph()

  message(`Welcome! In this experiment, you will play a game on the board shown below.`)
  await button()

  message(`Your current location on the board is highlighted in blue.`)
  cg.setCurrentState(trial.start)
  await button()


  message(`You can move by pressing keys to move from your current location.<br>Press “P" for 🟦 if you want to move in the direction of a blue arrow<br>or press "Q" for 🟥 if you want to move in the direction of a red arrow. Try it now!`)
  let next_states = cg.graph.successors(trial.start)
  for (const s of next_states) {
    $(`.GraphNavigation-State-${s}`).addClass('GraphNavigation-State-Highlighted')
  }

  console.log('cg.graph', cg.graph)
  await cg.navigate({n_steps: 1, leave_state: true})
  $(`.GraphNavigation-State`).removeClass('GraphNavigation-State-Highlighted')

  message(`
    The goal of the game is to earn points by collecting items from the board.<br>
    Try collecting this item!
  `)
  let goal = _.sample(cg.graph.successors(cg.state))
  // $("#gn-points").show()
  cg.setReward(goal, -1)
  console.log('goal', goal)
  await cg.navigate({n_steps: -1, goal, leave_state: true})

  message(`
    Nice! You got 10 points for collecting that item.
  `)
  await button()

  message(`
    In the non-practice games, those points will become a cash bonus!<br>
    (${trial.bonus.describeScheme()})
  `)
  await button()

  message(`
    Now try collecting this item.
    ${describeActions()}
  `)

  goal = _.sample(cg.graph.successors(cg.state))
  cg.setReward(goal, 2)
  await cg.navigate({n_steps: -1, goal, leave_open: true})

  message(`<i>Ouch!</i> You lost 5 points for collecting that one!`)
  cg.removeGraph()
  await button()

  $(root).empty()
  jsPsych.finishTrial(cg.data)
})


// function describeRewards(emojiGraphics) {
//   let vals = _.sortBy(_.without(_.keys(emojiGraphics), "0"), parseFloat)
//   let descriptions = vals.map(reward => {
//     return `${renderSmallEmoji(emojiGraphics[reward])}is worth ${reward}`
//   })
//   return descriptions.slice(0, -1).join(', ') + ', and ' + descriptions.slice(-1)
// }

addPlugin('collect_all', async function collect_all(root, trial) {
  trial = {
    ...trial,
    n_steps: -1,
  }
  setup(root)

  message(`Each kind of item is worth a different number of points:<br>` +
          describeRewards(trial.emojiGraphics))
  await button()

  message(`
    Try collecting all the items <b>(even the bad ones for now)</b>.
    ${describeActions()}
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
  let first = true
   // Validate that info.trial_sets is an array and contains arrays before iterating
  if (!Array.isArray(info.trial_sets)) {
    console.error('info.trial_sets is not an array:', info.trial_sets);
    // Handle the case where info.trial_sets is not what's expected
    info.trial_sets = []; // Default to an empty array if necessary
  }

  for (let trial_set of info.trial_sets) {
    if (!Array.isArray(trial_set)) {
      console.error('trial_set is not an array:', trial_set);
      continue; // Skip this iteration if trial_set is not an array
    }

  for (let trial_set of info.trial_sets) {
    if (first) {
      message(`Lets try a few easy ones. Try to collect the best item!
        Remeember: ${describeActions()}
      `)
      first = false
    } else {

      message(`
        Hmm... You didn't always collect the best item. Let's try again.<br>
        Remember: ${describeRewards(info.emojiGraphics)} <br>
        Also: ${describeActions()}
      `)
      await button()
      message(`Try to collect the best item! We'll continue when you always pick the best one.`)
    }
    let n_correct = 0
    for (let trial of trial_set) {
      trial = {...info, ...trial, show_steps: false}
      cg = new CircleGraph($("#cgi-root"), trial);
      let best = _.max(cg.graph.successors(cg.options.start).map(s => cg.rewards[s]))

      await cg.showGraph()
      await cg.navigate()
      n_correct += (cg.score == best)

      $(cg.wrapper).remove()
      cg.data.trial_type = 'learn_rewards'
      jsPsych.data.write(cg.data);
      psiturk.recordTrialData(cg.data)
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

addPlugin('easy', async function easy(root, trial) {
  setup(root)
  message(`
    On each turn, you have to make some number of moves.<br>
    The number of moves for the current turn is shown after you click the start button.
  `)
  await button()
})

addPlugin('vary_transition', async function vary_transition(root, trial) {
  setup(root)
  message(`
    So far we've been playing with one set of connections (the arrows).<br>
    But in the real game, the connections change on every round.
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
    $(`.GraphNavigation-State-${s}`).addClass('GraphNavigation-State-Highlighted')
  }
  await button()

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

  message("So far we've been showing you all the connections.")
  // message("So far we've been showing you all the items and connections.")
  cg = new CircleGraph($("#cgi-root"), trial);
  cg.showGraph()
  cg.setCurrentState(trial.start)
  await button()

  message("But in the real game, they're hidden!")
  await sleep(500)
  // $(".State > img").animate({'opacity': 0}, 1000)
  $(".GraphNavigation-edge").animate({'opacity': 0}, 1000)
  $(".GraphNavigation-arrow").animate({'opacity': 0}, 1000)
  await sleep(1300)

  await button()

  message(`
    You can reveal the item and connections at a location by hovering over it.<br>
    Hover over every location to continue.
  `)
  // cg.el.classList.add('hideStates')
  cg.el.classList.add('hideEdges')
  // $(".State > img").css({'opacity': ''})
  $(".GraphNavigation-edge").css({'opacity': ''})
  $(".GraphNavigation-arrow").css({'opacity': ''})
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
    Try to make as many points as you can!
  `)
  cg.options.hover_edges = true
  cg.options.hover_rewards = false
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

let ensureSign = x => x > 0 ? "+" + x : "" + x

function describeRewards(emojiGraphics) {
  let vals = _.sortBy(_.without(_.keys(emojiGraphics), "0"), parseFloat)
  // let descriptions = vals.map(reward => {
  //   return `${renderSmallEmoji(emojiGraphics[reward])}is worth ${reward}`
  // })
  // return descriptions.slice(0, -1).join(', ') + ', and ' + descriptions.slice(-1)
  let vv =  vals.map(reward => `
    <div class="describe-rewards-box">
    ${renderSmallEmoji(emojiGraphics[reward])}
    ${ensureSign(reward)}
    </div>
  `).join("")
  return `
    <div class="describe-rewards">
      ${vv}
    </div>
  `
}


function describeActions() {
  return `
    <div class="describe-actions">
      <div class="describe-actions-box"> 🟥 Arrow: Pressing "Q" </div>
      <div class="describe-actions-box"> 🟦 Arrow: Pressing "P" </div>
    </div>
  `
}

