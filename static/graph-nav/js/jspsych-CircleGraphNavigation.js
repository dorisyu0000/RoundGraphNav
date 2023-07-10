import {numString, markdown, makePromise, parseHTML, trialErrorHandling, graphicsUrl, sleep, addPlugin, documentEventPromise, invariant, makeButton} from './utils.js';
import {Graph} from './graphs.js';
import _ from '../../lib/underscore-min.js';
import $ from '../../lib/jquery-min.js';
import jsPsych from '../../lib/jspsych-exported.js';
import {bfs} from './graphs.js';

const BLOCK_SIZE = 100;
window.$ = $

export class CircleGraph {
  constructor(root, options) {
    this.root = $(root)
    window.cg = this
    console.log('CircleGraph', options)

    if (options.dynamicProperties) {
      Object.assign(options, options.dynamicProperties());
    }

    this.options = options;
    options.consume = options.consume ?? true
    options.edgeShow = options.edgeShow ?? (() => true);
    options.successorKeys = options.graphRenderOptions.successorKeys
    options.show_steps = options.show_steps ?? options.n_steps > 0
    options.show_points = options.show_points ?? true


    this.rewards = [...options.rewards] ?? Array(options.graph.length).fill(0)
    this.onStateVisit = options.onStateVisit ?? ((s) => {})
    this.score = options.score ?? 0

    if (options.consume) {
      this.rewards[options.start] = 0
    }
    options.rewardGraphics[0] = options.rewardGraphics[0] ?? ""
    options.graphics = this.rewards.map(x => options.rewardGraphics[x])

    this.graph = new Graph(options.graph)
    this.el = parseHTML(renderCircleGraph(
      this.graph, options.graphics, options.goal,
      {
        edgeShow: options.edgeShow,
        successorKeys: options.successorKeys,
        probe: options.probe,
        ...options.graphRenderOptions,
      }
    ));

    this.wrapper = $("<div>").html(`
    <div style="width: 800px;">
      <div class="GraphNavigation-header-left">
        <div id="gn-points">
          Points: <span class="GraphNavigation-header-value" id="GraphNavigation-points">0</span>
        </div>
        <div id="gn-steps">
          Moves: <span class="GraphNavigation-header-value" id="GraphNavigation-steps"></span> <br>
        </div>
      </div>
    </div>
    `)
    this.wrapper.append(this.el)

    // Making sure it is easy to clean up event listeners...
    this.cancellables = [];

    this.data = {
      trial: _.pick(this.options, 'graph', 'n_steps', 'rewards', 'start', 'hover_edges', 'hover_rewards')
    }
    this.setupLogging()
  }

  highlight(state) {
    this.logger('highlight', {state})
    $(`.GraphNavigation-State-${state}`).addClass('GraphNavigation-State-Highlighted')
  }
  unhighlight(state) {
    this.logger('unhighlight', {state})
    $(`.GraphNavigation-State-${state}`).removeClass('GraphNavigation-State-Highlighted')
  }

  showGraph() {
    this.root.append(this.wrapper)
    this.setupMouseTracking()
    // this.setupEyeTracking()

    $(`.ShadowState img`).remove()
    if (!this.options.show_steps) {
      $("#gn-steps").hide()
    }
    if (!this.options.show_points) {
      $("#gn-points").hide()
    }
  }

  async removeGraph() {
    $(this.el).animate({opacity: 0}, 300);
    await sleep(300)
    this.el.innerHTML = ""
    $(this.el).css({opacity: 1});
  }

  async showStartScreen(trial) {
    if (trial.bonus) {
      $('<p>')
      .addClass('Graph-bonus')
      .css({
        // 'position': 'absolute',
        'font-size': 20,
        // 'width': 500,
        'margin-top': 100,
        'margin-bottom': -125,
        // 'font-weight': 'bold'
      })
      .text(trial.bonus.reportBonus())
      .appendTo(this.root)
    }
    await makeButton(this.root, 'start', {css: {'margin-top': '210px'}, post_delay: 0})
    $('.Graph-bonus').remove()
    await sleep(200)
    if (trial.n_steps > 0) {
      let moves = $('<p>')
      .text(numString(trial.n_steps, "move"))
      .addClass('Graph-moves')
      .appendTo(this.root)
      await sleep(1000)
      moves.remove()
    }
    this.showGraph()
  }

  showEndScreen(msg) {
    this.el.innerHTML = `
      <p >${msg || ''}Press spacebar to continue.</p>
    `;
    return waitForSpace();
  }

  setupLogging() {
    this.data.events = []
    this.logger = function (event, info={}) {
      if (this.logger_callback) this.logger_callback(event, info)
      if (!event.startsWith('mouse')) console.log(event, info)
      // console.log(event, info)
      this.data.events.push({
        time: Date.now(),
        event,
        ...info
      });
    }
  }

  setupEyeTracking() {
    this.data.state_boxes = {}
    this.graph.states.forEach(s => {
      this.data.state_boxes[s] = this.el.querySelector(`.GraphNavigation-State-${s}`).getBoundingClientRect()
    })
    this.data.gaze_cloud = []
    GazeCloudAPI.OnResult = d => {
      this.data.gaze_cloud.push(d)
    }
  }

  setupMouseTracking() {
    if (this.options.hover_rewards) this.el.classList.add('hideStates');
    if (this.options.hover_edges) this.el.classList.add('hideEdges');


    // don't double up the event listeners
    if (this.mouseTrackingEnabled) return
    this.mouseTrackingEnabled = true

    for (const el of this.el.querySelectorAll('.State:not(.ShadowState)')) {
      const state = parseInt(el.getAttribute('data-state'), 10);
      el.addEventListener('mouseenter', (e) => {
        this.logger('mouseenter', {state})
        this.options.expansions || this.hover(state)
      });
      el.addEventListener('mouseleave', (e) => {
        this.logger('mouseleave', {state})
        this.options.expansions || this.unhover(state)
      });
    }
  }

  cancel() {
    // Use this for early termination of the graph.
    // Only used during free-form graph navigation.
    for (const c of this.cancellables) {
      c();
    }
    this.cancellables = [];
  }

  setCurrentState(state, options) {
    this.state = state;
    setCurrentState(this.el, this.graph, this.state, {
      edgeShow: this.options.edgeShow,
      successorKeys: this.options.successorKeys,
      onlyShowCurrentEdges: this.options.graphRenderOptions.onlyShowCurrentEdges,
      ...options,
    });
  }

  clickTransition(options) {
    options = options || {};
    /*
    Returns a promise that is resolved with {state} when there is a click
    corresponding to a valid state transition.
    */
    const invalidStates = new Set(options.invalidStates || [this.state, this.options.goal]);

    for (const s of this.graph.states) {
      const el = this.el.querySelector(`.GraphNavigation-State-${s}`);
      if (invalidStates.has(s)) {
        el.classList.remove('PathIdentification-selectable');
      } else {
        el.classList.add('PathIdentification-selectable');
      }
    }

    return new Promise((resolve, reject) => {
      const handler = (e) => {
        const el = $(e.target).closest('.PathIdentification-selectable').get(0);
        if (!el) {
          return;
        }
        e.preventDefault();
        const state = parseInt(el.getAttribute('data-state'), 10);

        this.el.removeEventListener('click', handler);
        resolve({state});
      }

      this.el.addEventListener('click', handler);
    });
  }

  async addScore(points, state) {
    if (points == 0) {
      return
    }
    this.setScore(this.score + points)
    let cls = (points < 0) ? "loss" : "win"
    let sign = (points < 0) ? "" : "+"
    let pop = $("<span>")
    .addClass('pop ' + cls)
    .text(sign + points)
    .appendTo($(`.GraphNavigation-ShadowState-${state}`))

    await sleep(1500)
    pop.remove()
  }

  setScore(score) {
    this.score = score;
    $("#GraphNavigation-points").html(this.score)
  }

  hideAllEdges() {
    $(`.GraphNavigation-edge`).removeClass('is-visible');
    $(`.GraphNavigation-arrow`).removeClass('is-visible');
  }

  showOutgoingEdges(state) {
    this.hideAllEdges()
    for (const successor of this.graph.successors(state)) {
      this.showEdge(state, successor)
    }
  }

  visitState(state, initial=false) {
    invariant(typeof(1) == 'number')
    this.logger('visit', {state, initial})

    if (!initial) {
      this.addScore(this.rewards[state], state)
    }
    if (this.options.consume) {
      this.rewards[state] = 0
      $(`.GraphNavigation-State-${state} img`).remove()
      // $(`.GraphNavigation-State-${state} img`).remove()
    }
    this.onStateVisit(state);
    this.setCurrentState(state);
  }

  async navigate(options) {
    let path = []
    this.logger('navigate', options)
    // $(`.GraphNavigation-State`).css({opacity: 1})
    // $('img').css({opacity: 1})
    // $(`.GraphNavigation-terminated`).removeClass('GraphNavigation-terminated');
    options = options || {};
    if (this.state === undefined) {
      this.setCurrentState(this.options.start)
    }
    let goal = options.goal ?? this.options.goal
    const termination = options.termination || ((cg, state) => {
      return (this.graph.successors(state).length == 0) || state == goal
    });
    let stepsLeft = options.n_steps ?? this.options.n_steps;

    $("#GraphNavigation-steps").html(stepsLeft)
    this.visitState(this.state, true)

    if (this.options.expansions) {
      await this.showForcedHovers()
      this.showOutgoingEdges(this.state)
    }

    while (true) { // eslint-disable-line no-constant-condition
      // State transition
      const g = this.graph;
      const {state} = await this.clickTransition({
        invalidStates: new Set(
          g.states.filter(s => !g.successors(this.state).includes(s))
        ),
      });
      if (this.options.expansions) {
        this.hideAllEdges()
        this.showEdge(this.state, state)
        this.showState(state)
        await sleep(500)
      }
      this.visitState(state)
      if (this.options.expansions) {
        this.showOutgoingEdges(state)
      }
      path.push(state)

      stepsLeft -= 1;
      $("#GraphNavigation-steps").html(stepsLeft)
      if (termination(this, state) || stepsLeft == 0) {
        this.logger('done')
        await sleep(500)
        $(".GraphNavigation-currentEdge").removeClass('GraphNavigation-currentEdge')
        if (options.leave_state) {
          // $(`.GraphNavigation-State-${state}`).animate({opacity: .1}, 500)
        } else if (options.leave_open) {
          $(`.GraphNavigation-State-${state}`).animate({opacity: 0}, 500)  // works because shadow state
          $('.State img').animate({opacity: 0}, 500)
          await sleep(1000)
          // $(this.el).animate({opacity: 0}, 500); await sleep(500)
          // $(this.el).empty()
        } else {
          await sleep(200)
          $(this.el).animate({opacity: 0}, 200)
          await sleep(500)
        }
        // $(this.el).addClass('.GraphNavigation-terminated')


        $(`.GraphNavigation-current`).removeClass('GraphNavigation-current');
        // this.setCurrentState(undefined)
        break;
      }
      await sleep(200);
      // await sleep(5)
    }
    return path
  }

  async showForcedHovers(start=0, stop) {
    $(this.el).addClass('forced-hovers')
    this.logger('begin forced hovers')
    let delay = 750
    // await sleep(delay)
    for (var i = start; i < (stop ?? this.options.expansions.length); i++) {
      let [s1, s2] = this.options.expansions[i]

      this.showEdge(s1, s2)
      await this.clickState(s2)

      this.hideEdge(s1, s2)
      this.showState(s2)
      await sleep(delay)

      this.hideState(s2)
    };
    $(this.el).removeClass('forced-hovers')
  }

  clickState(state) {
    return new Promise((resolve, reject) => {
      $(`.GraphNavigation-State-${state}`).css('cursor', 'pointer')
      $(`.GraphNavigation-State-${state}`).one('click', () => {
        $(`.GraphNavigation-State-${state}`).css('cursor', '')
        resolve()
      })
    })
  }

  highlightEdge(s1, s2) {
    $(this.el).addClass('SomeHighlighted')
    $(`.GraphNavigation-edge,.GraphNavigation-arrow`).removeClass('HighlightedEdge')
    $(`.GraphNavigation-edge-${s1}-${s2}`).addClass('HighlightedEdge')
  }

  showState(state) {
    this.logger('showState', {state})
    $(`.GraphNavigation-State-${state}`).addClass('is-visible')
  }

  hideState(state) {
    $(`.GraphNavigation-State-${state}`).removeClass('is-visible')
  }

  showEdge(state, successor) {
    $(`.GraphNavigation-edge-${state}-${successor}`).addClass('is-visible')
  }

  hideEdge(state, successor) {
    $(`.GraphNavigation-edge-${state}-${successor}`).removeClass('is-visible')
  }

  hover(state) {
    this.showState(state)
    for (const successor of this.graph.successors(state)) {
      this.showEdge(state, successor)
    }
    for (const pred of this.graph.predecessors(state)) {
      this.showEdge(pred, state)
    }
  }

  unhover(state) {
    this.hideState(state)
    for (const successor of this.graph.successors(state)) {
      this.hideEdge(state, successor)
    }
    for (const pred of this.graph.predecessors(state)) {
      this.hideEdge(pred, state)
    }
  }

  loadTrial(trial) {
    if (trial.start != undefined) this.setCurrentState(trial.start)
    this.setRewards(trial.rewards)
    this.options.n_steps = trial.n_steps ?? this.options.n_steps
  }

  setReward(state, reward) {
    this.rewards[state] = parseFloat(reward)
    let graphic = this.options.rewardGraphics[reward]
    $(`.GraphNavigation-State-${state}`).html(`
      <img src="${graphicsUrl(graphic)}" dragggable=false/>
    `)
  }

  setRewards(rewards) {
    for (let s of _.range(this.rewards.length)) {
      this.setReward(s, s == this.state ? 0 : rewards[s])
    }
  }
}


const stateTemplate = (state, graphic, options) => {
  let cls = `GraphNavigation-State-${state}`;
  if (options.goal) {
    cls += ' GraphNavigation-goal';
  }
  if (options.probe) {
    cls += ' GraphNavigation-probe';
  }
  return `
  <div class="State GraphNavigation-State ${cls || ''}" style="${options.style || ''}" data-state="${state}">
    <img src="${graphicsUrl(graphic)}" dragggable=false/>
  </div>
  `;
};

export const renderSmallEmoji = (graphic, cls) => `
<img style="height:40px" src="${graphicsUrl(graphic)}" />
`;

function keyForCSSClass(key) {
  // Using charcode here, for unrenderable keys like arrows.
  return key.charCodeAt(0);
}

function graphXY(graph, width, height, scaleEdgeFactor, fixedXY) {
  /*
  This function computes the pixel placement of nodes and edges, given the parameters.
  */
  invariant(0 <= scaleEdgeFactor && scaleEdgeFactor <= 1);

  // We make sure to bound our positioning to make sure that our blocks are never cropped.
  const widthNoMargin = width - BLOCK_SIZE;
  const heightNoMargin = height - BLOCK_SIZE;

  // We compute bounds for each dimension.
  const maxX = Math.max.apply(null, fixedXY.map(xy => xy[0]));
  const minX = Math.min.apply(null, fixedXY.map(xy => xy[0]));
  const rangeX = maxX-minX;
  const maxY = Math.max.apply(null, fixedXY.map(xy => xy[1]));
  const minY = Math.min.apply(null, fixedXY.map(xy => xy[1]));
  const rangeY = maxY-minY;

  // We determine the appropriate scaling factor for the dimensions by comparing the
  // aspect ratio of the bounding box of the embedding with the aspect ratio of our
  // rendering viewport.
  let scale;
  if (rangeX/rangeY > widthNoMargin/heightNoMargin) {
    scale = widthNoMargin / rangeX;
  } else {
    scale = heightNoMargin / rangeY;
  }

  // We can now compute an appropriate margin for each dimension that will center our graph.
  let marginX = (width - rangeX * scale) / 2;
  let marginY = (height - rangeY * scale) / 2;

  // Now we compute our coordinates.
  const coordinate = {};
  const scaled = {};
  for (const state of graph.states) {
    let [x, y] = fixedXY[state];
    // We subtract the min, rescale, and offset appropriately.
    x = (x-minX) * scale + marginX;
    y = (y-minY) * scale + marginY;
    coordinate[state] = [x, y];
    // We rescale for edges/keys by centering over the origin, scaling, then translating to the original position.
    scaled[state] = [
      (x - width/2) * scaleEdgeFactor + width/2,
      (y - height/2) * scaleEdgeFactor + height/2,
    ];
  }

  return {
    coordinate,
    scaled,
    edge(state, successor) {
      return normrot(scaled[state], scaled[successor]);
    },
  };
}

function normrot([x, y], [sx, sy]) {
  // This function returns the length/norm and angle of rotation
  // needed for a line starting at [x, y] to end at [sx, sy].
  const norm = Math.sqrt(Math.pow(x-sx, 2) + Math.pow(y-sy, 2));
  const rot = Math.atan2(sy-y, sx-x);
  return {norm, rot};
}

function renderCircleGraph(graph, gfx, goal, options) {
  options = options || {};
  options.edgeShow = options.edgeShow || (() => true);
  const successorKeys = options.successorKeys;
  /*
  fixedXY: Optional parameter. This requires x,y coordinates that are in
  [-1, 1]. The choice of range is a bit arbitrary; results from code that assumes
  the output of sin/cos.
  */
  // Controls how far the key is from the node center. Scales keyWidth/2.
  const keyDistanceFactor = options.keyDistanceFactor || 1.4;

  const width = options.width;
  const height = options.height;

  const xy = graphXY(
    graph,
    width, height,
    // Scales edges and keys in. Good for when drawn in a circle
    // since it can help avoid edges overlapping neighboring nodes.
    options.scaleEdgeFactor || 0.95,
    options.fixedXY,
  );

  const states = graph.states.map(state => {
    const [x, y] = xy.coordinate[state];
    return stateTemplate(state, gfx[state], {
      probe: state == options.probe,
      goal: state == goal,
      style: `transform: translate(${x - BLOCK_SIZE/2}px,${y - BLOCK_SIZE/2}px);`,
    });
  });

  function addArrow(state, successor, norm, rot) {
      const [x, y] = xy.scaled[state];
      const [sx, sy] = xy.scaled[successor];
      arrows.push(`
        <div class="GraphNavigation-arrow GraphNavigation-edge-${state}-${successor}"
        style="
        transform-origin: center;
        transform:
          translate(${sx-35}px, ${sy-35}px)
          rotate(${rot}rad)
          translate(-30px)
          rotate(90deg)
        ;">
        <svg height="70" width="70" style="display: block; fill: currentColor; stroke: currentColor">
            <polygon points="
            35  , 38
            29  , 50
            41 , 50
          " class="triangle" />
        </svg>
        </div>
      `);
    }

  // HACK for the score animation
  let shadowStates = states.map(state => {
    return state
    .replaceAll("-State-", "-ShadowState-")
    .replaceAll("\"State ", "\"State ShadowState ")
  })
  window.states = states
  window.shadowStates = shadowStates

  const succ = [];
  const arrows = [];
  for (const state of graph.states) {
    let [x, y] = xy.scaled[state];
    graph.successors(state).forEach((successor, idx) => {
      // if (state >= successor) {
      //   return;
      // }
      const e = xy.edge(state, successor);
      // const opacity = options.edgeShow(state, successor) ? 1 : 0;
      // opacity: ${opacity};
      succ.push(`
        <div class="GraphNavigation-edge GraphNavigation-edge-${state}-${successor}" style="
        width: ${e.norm}px;
        transform: translate(${x}px,${y-1}px) rotate(${e.rot}rad);
        "></div>
      `);

      // We also add the key labels here
      addArrow(state, successor, e.norm, e.rot);
      // addArrow(successor, state, e.norm);
    });
  }

  return `
  <div class="GraphNavigation withGraphic" style="width: ${width}px; height: ${height}px;">
    ${arrows.join('')}
    ${succ.join('')}
    ${shadowStates.join('')}
    ${states.join('')}
  </div>
  `;
}

export function queryEdge(root, state, successor) {
  /*
  Returns the edge associated with nodes `state` and `successor`. Since we only
  have undirected graphs, they share an edge, so some logic is needed to find it.
  */
  return root.querySelector(`.GraphNavigation-edge-${state}-${successor}`);
}

function setCurrentState(display_element, graph, state, options) {
  options = options || {};
  options.edgeShow = options.edgeShow || (() => true);
  // showCurrentEdges enables rendering of current edges/keys. This is off for PathIdentification and AcceptReject.
  options.showCurrentEdges = typeof(options.showCurrentEdges) === 'undefined' ? true : options.showCurrentEdges;
  const allKeys = _.unique(_.flatten(options.successorKeys));

  // Remove old classes!
  function removeClass(cls) {
    const els = display_element.querySelectorAll('.' + cls);
    for (const e of els) {
      e.classList.remove(cls);
    }
  }
  removeClass('GraphNavigation-current')
  removeClass('GraphNavigation-currentEdge')
  // removeClass('GraphNavigation-currentKey')
  for (const key of allKeys) {
    removeClass(`GraphNavigation-currentEdge-${keyForCSSClass(key)}`)
    // removeClass(`GraphNavigation-currentKey-${keyForCSSClass(key)}`)
  }

  // Can call this to clear out current state too.
  if (state == null) {
    return;
  }

  // Add new classes! Set current state.
  display_element.querySelector(`.GraphNavigation-State-${state}`).classList.add('GraphNavigation-current');

  if (!options.showCurrentEdges) {
    return;
  }

  if (options.onlyShowCurrentEdges) {
    for (const el of display_element.querySelectorAll('.GraphNavigation-edge,.GraphNavigation-arrow')) {
    // for (const el of display_element.querySelectorAll('.GraphNavigation-edge')) {
      el.style.opacity = 0;
    }
  }

  graph.successors(state).forEach((successor, idx) => {
    if (!options.edgeShow(state, successor)) {
      return;
    }

    // Set current edges
    let el = queryEdge(display_element, state, successor);
    el.classList.add('GraphNavigation-currentEdge');
    // el.classList.add(`GraphNavigation-currentEdge-${keyForCSSClass(successorKeys[idx])}`);
    if (options.onlyShowCurrentEdges) {
      el.style.opacity = 1;
    }

    // Now setting active keys
    // el = display_element.querySelector(`.GraphNavigation-arrow-${state}-${successor}`);
    // el.classList.add('GraphNavigation-currentKey');
    // if (options.onlyShowCurrentEdges) {
    //   el.style.opacity = 1;
    // }
  });
}

async function waitForSpace() {
  return documentEventPromise('keypress', (e) => {
    if (e.keyCode == 32) {
      e.preventDefault();
      return true;
    }
  });
}

function renderKeyInstruction(keys) {
  function renderInputInstruction(inst) {
    return `<span style="border: 1px solid black; border-radius: 3px; padding: 3px; font-weight: bold; display: inline-block;">${inst}</span>`;
  }

  if (keys.accept == 'Q') {
    return `${renderInputInstruction('Yes (q)')} &nbsp; ${renderInputInstruction('No (p)')}`;
  } else {
    return `${renderInputInstruction('No (q)')} &nbsp; ${renderInputInstruction('Yes (p)')}`;
  }
}

addPlugin('main', trialErrorHandling(async function main(root, trial) {
  // trial.n_steps = -1;
  cg = new CircleGraph($(root), trial);
  await cg.showStartScreen(trial)
  await cg.navigate()
  trial.bonus.addPoints(cg.score)
  cg.data.current_bonus = trial.bonus.dollars()
  $(root).empty()
  jsPsych.finishTrial(cg.data)
}));
