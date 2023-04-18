import {numString, markdown, makePromise, parseHTML, trialErrorHandling, graphicsUrl, setTimeoutPromise, addPlugin, documentEventPromise, invariant, makeButton, sleep} from './utils.js';
import _ from '../../lib/lodash-min.js'
import $ from '../../lib/jquery-min.js';
import jsPsych from '../../lib/jspsych-exported.js';
import {bfs} from './graphs.js';
import {queryEdge, CircleGraph, renderSmallEmoji} from './jspsych-CircleGraphNavigation.js';

window._ = _
addPlugin('CircleGraphInstructions', async function(root, trial) {
  let top = $('<div>').appendTo(root).css({
    'height': '110px',
    'width': '800px'
  })
  let msg = $('<p>').appendTo(top).css('font-size', '16pt')
  let cg_root = $('<div>').appendTo(root)
  const cg = new CircleGraph(cg_root, {...trial});

  function button(txt='continue') {
    return makeButton(top, txt, {
      css: {'margin-top': '8px'},
      pre_delay: 0,
      // pre_delay: 2,
      post_delay: 0.2
    })
  }

  function fillRewards() {
    let uniqRewards = _.without(_.keys(trial.rewardGraphics), '0')
    let rewards = [];
    while (rewards.length < cg.rewards.length) {
      rewards.push(..._.shuffle(uniqRewards))
    }
    cg.setRewards(rewards)
  }


  // msg.text(`Welcome! In this experiment, you will play a game on the board shown below.`)
  // await button()

  // msg.text(`Your current location on the board is highlighted in blue.`)
  // cg.setCurrentState(trial.start)
  // $(".GraphNavigation-currentEdge").removeClass('GraphNavigation-currentEdge')
  // await button()

  // msg.text(`You can move between locations that are connected by a line.`)
  // await button()

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
  // await button()


  // msg.html(`
  //   Each kind of item is worth a different number of points.<br>
  //   Try collecting all of them (even the bad ones for now).
  // `)
  // fillRewards()
  // await cg.navigate({
  //   termination: (cg, s) => !_.some(cg.rewards)
  // })


  cg.setCurrentState(2)  // DEBUGGING
  $("#gn-points").show()
  $("#gn-steps").show()


  // msg.html(`
  //   Nice work! But in the real game, you should try to avoid the bad items.
  // `)
  // await button()

  // msg.html(`
  //   On each turn, you have to make some number of moves.<br>
  //   The number of moves left is shown on the left, under your score.
  // `)
  // $("#gn-steps").show()
  // $("#GraphNavigation-steps").html(3)
  // await button()


  fillRewards() // TODO: this should be an easy trial
  // cg.el.classList.add('hideStates')
  // cg.el.classList.add('hideEdges')

  let test = {
    n_steps: 1,
    max_points: 10,
    start: 7,
    rewards: [-10, -10, -10, -10, 10, 10, 10, 10],
  }

  cg.setScore(0)
  msg.html(`Let's try an easy one. Try to make as many points as you can in just one move!`)
  cg.loadTrial(test)
  await cg.navigate()

  if (cg.score == test.max_points) {
    msg.html("Awesome! That was the most points you could have made.")
  } else {
    await sleep(1000)
    msg.html(`Hmm... you should be able to make ${test.max_points} points. Why don't we try again?`)
    await button("reset")

    cg.setScore(0)
    cg.loadTrial(test)
    await cg.navigate()

    if (cg.score == test.max_points) {
      msg.html("That's more like it! Well done!")
    } else {
      msg.html("Not quite, but let's move on for now.")
    }
  }
  await button()

  msg.html("Let's try a few more easy ones. Try to make as many points as you can!")
  // Several len 1 trials

  msg.html("OK, let's step it up a notch. Let's try a few two-move games.")












  // msg.html(`
  //   Nice work! But now we're going to make things a little harder...
  // `)
  // fillRewards()
  // await button()

  // cg.el.classList.add('hideStates')
  // cg.el.classList.add('hideEdges')

  // msg.html(`
  //   In the real game, you don't get to see
  // `)

});
