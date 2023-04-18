import {numString, markdown, makePromise, parseHTML, trialErrorHandling, graphicsUrl, setTimeoutPromise, addPlugin, documentEventPromise, invariant, makeButton} from './utils.js';
import _ from '../../lib/lodash-min.js'
import $ from '../../lib/jquery-min.js';
import jsPsych from '../../lib/jspsych-exported.js';
import {bfs} from './graphs.js';
import {queryEdge, CircleGraph, renderSmallEmoji} from './jspsych-CircleGraphNavigation.js';

window._ = _
addPlugin('CircleGraphWelcome', async function(root, trial) {
  let top = $('<div>').appendTo(root).css({
    'height': '110px',
    'width': '800px'
  })
  let msg = $('<p>').appendTo(top).css('font-size', '16pt')
  let cg_root = $('<div>').appendTo(root)
  const cg = new CircleGraph(cg_root, {...trial, n_steps: 0});

  function cont() {
    return makeButton(top, "continue", {
      css: {'margin-top': '8px'},
      pre_delay: 0,
      // pre_delay: 2,
      post_delay: 0.2
    })
  }

  function fillRewards() {
    let uniqRewards = _.without(_.keys(trial.rewardGraphics), '0')
    let reward = [];
    while (reward.length < cg.reward.length) {
      reward.push(..._.shuffle(uniqRewards))
    }
    for (let s of _.range(cg.reward.length)) {
      if (s != cg.state) cg.updateReward(s, reward[s])
    }
  }


  // msg.text(`Welcome! In this experiment, you will play a game on the board shown below.`)
  // await cont()

  // msg.text(`Your current location on the board is highlighted in blue.`)
  // cg.setCurrentState(trial.start)
  // $(".GraphNavigation-currentEdge").removeClass('GraphNavigation-currentEdge')
  // await cont()

  // msg.text(`You can move between locations that are connected by a line.`)
  // await cont()

  // msg.text(`You move to a location by clicking on it. Try it now!`)
  // cg.setCurrentState(trial.start)
  // await cg.navigate({n_steps: 1})

  // msg.html(`
  //   The goal of the game is to earn points by collecting items from the board.<br>
  //   Try collecting this item!
  // `)
  // let goal = _.sample(cg.options.graph.successors(cg.state))
  // $("#gn-points").show()
  // cg.updateReward(goal, 10)
  // await cg.navigate({n_steps: -1, goal})

  // msg.html(`
  //   Nice! You got 10 points for collecting that item. What about this one?
  // `)
  // goal = _.sample(cg.options.graph.successors(cg.state))
  // cg.updateReward(goal, -5)
  // await cg.navigate({n_steps: -1, goal})

  // msg.html(`<i>Ouch!</i> You lost 5 points for collecting that one!`)
  // await cont()

  cg.setCurrentState(2)  // DEBUGGING
  $("#gn-points").show()

  msg.html(`
    Each kind of item is worth a different number of points.<br>
    Try collecting all of them (even the bad ones for now).
  `)
  fillRewards()
  await cg.navigate({
    termination: (cg, s) => !_.some(cg.reward)
  })


  // msg.html(`
  //   Nice work! But in the real game, you should try to avoid the bad items.
  // `)
  // await cont()

  // msg.html(`
  //   On each turn, you have to make some number of steps.<br>
  //   The number of steps left is shown on the left, under your score.
  // `)
  // $("#gn-steps").show()
  // $("#GraphNavigation-steps").html(3)
  // await cont()

  fillRewards() // TODO: this should be an easy trial
  msg.html(`Try to make as many points as you can in 3 moves!`)
  await cg.navigate({n_steps: 3})



  // msg.html(`
  //   Nice work! But now we're going to make things a little harder...
  // `)
  // fillRewards()
  // await cont()

  // cg.el.classList.add('hideStates')
  // cg.el.classList.add('hideEdges')

  // msg.html(`
  //   In the real game, you don't get to see
  // `)

});
