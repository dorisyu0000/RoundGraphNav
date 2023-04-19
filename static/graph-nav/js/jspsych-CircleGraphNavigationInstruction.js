import {numString, markdown, makePromise, parseHTML, trialErrorHandling, graphicsUrl, setTimeoutPromise, addPlugin, documentEventPromise, invariant, makeButton, sleep} from './utils.js';
import _ from '../../lib/lodash-min.js'
import $ from '../../lib/jquery-min.js';
import jsPsych from '../../lib/jspsych-exported.js';
import {bfs} from './graphs.js';
import {queryEdge, CircleGraph, renderSmallEmoji} from './jspsych-CircleGraphNavigation.js';

window._ = _
addPlugin('CircleGraphInstructions', async function(root, info) {
  let top = $('<div>').appendTo(root).css({
    'height': '120px',
    'width': '800px'
  })
  let msg = $('<p>').appendTo(top).css('font-size', '16pt')
  let cg_root = $('<div>').appendTo(root)

  let trials = info.trials

  trials.first.rewards = Array(8).fill(0)
  trials.first.show_points = false
  trials.first.show_steps = false
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

  msg.text(`Welcome! In this experiment, you will play a game on the board shown below.`)
  await button()

  msg.text(`Your current location on the board is highlighted in blue.`)
  cg.setCurrentState(trials.first.start)
  // $(".GraphNavigation-currentEdge").removeClass('GraphNavigation-currentEdge')
  await button()

  msg.text(`You can move between locations that are connected by a line.`)
  await button()

  msg.text(`You move to a location by clicking on it. Try it now!`)
  console.log('cg.graph', cg.graph)
  // cg.setCurrentState(trials.first.start)
  await cg.navigate({n_steps: 1, leave_state: true})

  msg.html(`
    The goal of the game is to earn points by collecting items from the board.<br>
    Try collecting this item!
  `)
  let goal = _.sample(cg.graph.successors(cg.state))
  $("#gn-points").show()
  cg.setReward(goal, 10)
  console.log('goal', goal)
  await cg.navigate({n_steps: -1, goal, leave_state: true})

  msg.html(`
    Nice! You got 10 points for collecting that item. What about this one?
  `)
  goal = _.sample(cg.graph.successors(cg.state))
  cg.setReward(goal, -5)
  await cg.navigate({n_steps: -1, goal, leave_open: true})


  msg.html(`<i>Ouch!</i> You lost 5 points for collecting that one!`)
  await button()

  let vals = _.sortBy(_.without(_.keys(info.rewardGraphics), "0"), parseFloat)
  let descriptions = vals.map(reward => {
    return `${renderSmallEmoji(info.rewardGraphics[reward])} is worth ${reward}`
  })
  let spec = descriptions.slice(0, -1).join(', ') + ', and ' + descriptions.slice(-1)

  msg.html(`Each kind of item is worth a different number of points:<br>` + spec)

  await button()

  // $(cg.el).animate({opacity: 0.2}, 300);

  msg.html(`
    Try collecting all the items (even the bad ones for now).
  `)

  $(cg.el).animate({opacity: 1}, 100);
  trials.collect_all.start = undefined
  cg.loadTrial(trials.collect_all)
  await cg.navigate({
    n_steps: -1,
    leave_open: true,
    termination: (cg, s) => !_.some(cg.rewards)
  })

  msg.html(`
    Nice work! But in the real game, you should try to avoid the bad items.
  `)
  await button()

  msg.html(`
    On each turn, you have to make some number of moves.<br>
    The number of moves left is shown on the left, under your score.
  `)
  $("#gn-steps").show()
  $("#GraphNavigation-steps").html(3)
  await button()


  msg.html(`Let's try an easy one. Try to make as many points as you can in just one move!`)
  cg.loadTrial(trials.easy)
  console.log('trials.easy', trials.easy)
  await cg.navigate({leave_open: true})

  let best_item = renderSmallEmoji(info.rewardGraphics[10])
  if (cg.score == info.easy_max) {
    msg.html("Awesome! That was the most points you could have made.")
    // $(cg.el).animate({opacity: 0.2}, 300);

  } else {
    msg.html(`Hmm... you should be able to make ${info.easy_max} points. Why don't we try again?`)
    // $(cg.el).animate({opacity: 0.2}, 300);
    await button("reset")

    msg.html(`Hint: the ${best_item} is worth the most!`)
    // $(cg.el).animate({opacity: 1}, 100);
    cg.setScore(0)
    cg.loadTrial(trials.easy)
    await cg.navigate({leave_open: true})

    // $(cg.el).animate({opacity: 0.2}, 300);
    if (cg.score == info.easy_max) {
      msg.html("That's more like it! Well done!")
    } else {
      msg.html("Not quite, but let's move on for now.")
    }
  }
  await button()


  msg.html("Let's try a few more easy ones. Try to make as many points as you can!")
  // await button()
  // trials.move1 = trials.move1.slice(1)
  for (let trial of trials.move1) {
    cg = new CircleGraph(cg_root, {...info, ...trial});
    await cg.navigate({leave_open: true})
  }
  msg.html("OK, let's step it up a notch. Try a few two-move games.")
  // $(cg.el).animate({opacity: 0.2}, 300);
  await button()

  for (let trial of trials.move2) {
    cg = new CircleGraph(cg_root, {...info, ...trial});
    await cg.navigate({leave_open: true})
  }

  msg.html("How about three moves?")
  // $(cg.el).animate({opacity: 0.2}, 300);
  await button()

  for (let trial of trials.move3) {
    cg = new CircleGraph(cg_root, {...info, ...trial});
    await cg.navigate({leave_open: true})
  }

  $(this.el).animate({opacity: 0}, 500)



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
