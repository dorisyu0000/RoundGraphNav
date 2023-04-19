import {numString, markdown, makePromise, parseHTML, trialErrorHandling, graphicsUrl, setTimeoutPromise, addPlugin, documentEventPromise, invariant, makeButton, sleep} from './utils.js';
import _ from '../../lib/lodash-min.js'
import $ from '../../lib/jquery-min.js';
import jsPsych from '../../lib/jspsych-exported.js';
import {bfs} from './graphs.js';
import {queryEdge, CircleGraph, renderSmallEmoji} from './jspsych-CircleGraphNavigation.js';

window._ = _
addPlugin('CircleGraphInstructions', async function(root, info) {
  let top = $('<div>').appendTo(root).css({
    'height': '110px',
    'width': '800px'
  })
  let msg = $('<p>').appendTo(top).css('font-size', '16pt')
  let cg_root = $('<div>').appendTo(root)

  let trials = info.trials

  cg = new CircleGraph(cg_root, {...info, ...trials.first});
  console.log('trials.first.start', trials.first.start)

  function button(txt='continue', options={}) {
    return makeButton(top, txt, {
      css: {'margin-top': '8px'},
      pre_delay: 0,
      // pre_delay: 2,
      post_delay: 0.2,
      ...options
    })
  }

  // msg.text(`Welcome! In this experiment, you will play a game on the board shown below.`)
  // await button()

  // msg.text(`Your current location on the board is highlighted in blue.`)
  // cg.setCurrentState(trials.first.start)
  // $(".GraphNavigation-currentEdge").removeClass('GraphNavigation-currentEdge')
  // await button()

  // msg.text(`You can move between locations that are connected by a line.`)
  // await button()

  // msg.text(`You move to a location by clicking on it. Try it now!`)
  // console.log('cg.graph', cg.graph)
  // cg.setCurrentState(trials.first.start)
  // await cg.navigate({n_steps: 1, leave_open: true})

  // msg.html(`
  //   The goal of the game is to earn points by collecting items from the board.<br>
  //   Try collecting this item!
  // `)
  // let goal = _.sample(cg.graph.successors(cg.state))
  // $("#gn-points").show()
  // cg.setReward(goal, 10)
  // await cg.navigate({n_steps: -1, goal, leave_open: true})

  // msg.html(`
  //   Nice! You got 10 points for collecting that item. What about this one?
  // `)
  // goal = _.sample(cg.graph.successors(cg.state))
  // cg.setReward(goal, -5)
  // await cg.navigate({n_steps: -1, goal})

  // msg.html(`<i>Ouch!</i> You lost 5 points for collecting that one!`)
  // await button()

  // msg.html(`
  //   Each kind of item is worth a different number of points.<br>
  //   Try collecting all of them (even the bad ones for now).
  // `)
  // trials.collect_all.start = undefined
  // cg.loadTrial(trials.collect_all)
  // await cg.navigate({
  //   n_steps: -1,
  //   termination: (cg, s) => !_.some(cg.rewards)
  // })

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



  // msg.html(`Let's try an easy one. Try to make as many points as you can in just one move!`)
  // cg.loadTrial(trials.easy)
  // console.log('trials.easy', trials.easy)
  // await cg.navigate()

  // let best_item = renderSmallEmoji(info.rewardGraphics[10])
  // if (cg.score == info.easy_max) {
  //   msg.html("Awesome! That was the most points you could have made.")
  // } else {
  //   // await sleep(1000)
  //   msg.html(`Hmm... you should be able to make ${info.easy_max} points. Why don't we try again?`)
  //   await button("reset")
  //   msg.html(`Hint: the ${best_item} is worth the most!`)

  //   cg.setScore(0)
  //   cg.loadTrial(trials.easy)
  //   await cg.navigate()

  //   if (cg.score == info.easy_max) {
  //     msg.html("That's more like it! Well done!")
  //   } else {
  //     msg.html("Not quite, but let's move on for now.")
  //   }
  // }
  // await button()

  // $("#gn-points").show()
  // $("#gn-steps").show()

  msg.html("Let's try a few more easy ones. Try to make as many points as you can!")
  // await button()
  // trials.move1 = trials.move1.slice(1)
  for (let trial of trials.move1) {
    cg = new CircleGraph(cg_root, {...info, ...trial});
    await cg.navigate({leave_open: true})
  }
  msg.html("OK, let's step it up a notch. Let's try a few two-move games.")
  $(cg.el).animate({opacity: 0.2}, 300);

  await button()

  for (let trial of trials.move2) {
    cg = new CircleGraph(cg_root, {...info, ...trial});
    await cg.navigate({leave_open: true})
  }












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
