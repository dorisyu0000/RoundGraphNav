import {numString, markdown, makePromise, parseHTML, trialErrorHandling, graphicsUrl, sleep, addPlugin, documentEventPromise, invariant, makeButton} from './utils.js';
import _ from '../../lib/underscore-min.js';
import $ from '../../lib/jquery-min.js';
import jsPsych from '../../lib/jspsych-exported.js';
import {bfs} from './graphs.js';

const BLOCK_SIZE = 100;
// replace BLOCK_SIZE with hi=parseHTML('<div class="State" style="display: block;position: fixed;left: 200vw;"></div>');document.body.append(hi);console.log(hi.offsetWidth);hi.remove();console.log(hi.offsetWidth)

export class CircleGraph {
  constructor(root, options) {
    root = $(root)
    window.cg = this
    console.log('CircleGraph', options)

    if (options.dynamicProperties) {
      Object.assign(options, options.dynamicProperties());
    }

    this.options = options;
    options.consume = options.consume ?? true
    options.edgeShow = options.edgeShow ?? (() => true);
    options.successorKeys = options.graphRenderOptions.successorKeys

    this.rewards = options.reward ?? Array(options.adjacency.length).fill(0)
    this.onStateVisit = options.onStateVisit ?? ((s) => {})
    this.score = options.score ?? 0

    if (options.consume) {
      this.rewards[options.start] = 0
    }
    options.rewardGraphics[0] = options.rewardGraphics[0] ?? ""
    options.graphics = this.rewards.map(x => options.rewardGraphics[x])

    this.el = parseHTML(renderCircleGraph(
      options.graph, options.graphics, options.goal,
      {
        edgeShow: options.edgeShow,
        successorKeys: options.successorKeys,
        probe: options.probe,
        ...options.graphRenderOptions,
      }
    ));

    root.html(`
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
    root.append(this.el);

    options.show_steps = options.show_steps ?? options.n_steps > 0
    if (!options.show_steps) {
      $("#gn-steps").hide()
    }
    options.show_points = options.show_points ?? true
    if (!options.show_points) {
      $("#gn-points").hide()
    }

    // Making sure it is easy to clean up event listeners...
    this.cancellables = [];
  }

  setupLogging() {
    this.data = {
      events: [],
      trial: _.pick(this.options, 'practice', 'start', 'reward')
    }
    let start_time = Date.now()
    this.logger = function (event, info={}) {
      // if (!event.startsWith('mouse')) console.log(event, info)
      console.log(event, info)
      this.data.events.push({
        time: Date.now() - start_time,
        event,
        ...info
      });
    }
  }

  setupMouseTracking() {
    if (this.options.hover_rewards) this.el.classList.add('hideStates');
    if (this.options.hover_edges) this.el.classList.add('hideEdges');

    for (const el of this.el.querySelectorAll('.State:not(.ShadowState)')) {
      const state = parseInt(el.getAttribute('data-state'), 10);
      el.addEventListener('mouseenter', (e) => {
        this.logger('mouseenter', {state})
        el.classList.add('is-visible');
        for (const successor of this.options.graph.successors(state)) {
          queryEdge(this.el, state, successor).classList.add('is-visible');
        }
      });
      el.addEventListener('mouseleave', (e) => {
        this.logger('mouseleave', {state})
        el.classList.remove('is-visible');
        for (const successor of this.options.graph.successors(state)) {
          queryEdge(this.el, state, successor).classList.remove('is-visible');
        }
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
    setCurrentState(this.el, this.options.graph, this.state, {
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

    for (const s of this.options.graph.states) {
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

  addScore(points, state) {
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

    // await sleep(1000)
    // pop.remove()
    // .appendTo($("#gn-points"))
  }

  setScore(score) {
    this.score = score;
    $("#GraphNavigation-points").html(this.score)
  }

  visitState(state, initial=false) {
    this.logger('visit', {state, initial})

    if (!initial) {
      this.addScore(this.rewards[state], state)
      if (this.options.consume) {
        this.rewards[state] = 0
        $(`.GraphNavigation-State-${state} img`).remove()
        // $(`.GraphNavigation-State-${state} img`).remove()
      }
    }
    this.onStateVisit(state);
    this.setCurrentState(state);
  }

  async navigate(options) {
    options = options || {};
    let goal = options.goal ?? this.options.goal
    const termination = options.termination || ((cg, state) => state == goal);
    let stepsLeft = options.n_steps ?? this.options.n_steps;

    this.setupLogging()
    this.setupMouseTracking()

    $("#GraphNavigation-steps").html(stepsLeft)
    this.visitState(this.state, true)

    while (true) { // eslint-disable-line no-constant-condition
      // State transition
      const g = this.options.graph;
      const {state} = await this.clickTransition({
        invalidStates: new Set(
          g.states.filter(s => !g.successors(this.state).includes(s))
        ),
      });
      this.visitState(state)

      stepsLeft -= 1;
      $("#GraphNavigation-steps").html(stepsLeft)
      if (termination(this, state) || stepsLeft == 0) {
        $(".GraphNavigation-currentEdge").removeClass('GraphNavigation-currentEdge')
        break;
      }
      await sleep(200);
    }
  }

  loadTrial(trial) {
    this.setCurrentState(trial.start)
    this.setRewards(trial.rewards)
    this.options.n_steps = trial.n_steps ?? this.options.n_steps
  }

  setReward(state, reward) {
    this.rewards[state] = parseFloat(reward)
    let graphic = this.options.rewardGraphics[reward]
    $(`.GraphNavigation-State-${state}`).html(`
      <img src="${graphicsUrl(graphic)}" />
    `)
  }

  setRewards(rewards) {
    for (let s of _.range(this.rewards.length)) {
      this.setReward(s, s == this.state ? 0 : rewards[s])
    }
  }

  endTrialScreen(msg) {
    this.el.innerHTML = `
      <p >${msg || ''}Press spacebar to continue.</p>
    `;
    return waitForSpace();
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
    <img src="${graphicsUrl(graphic)}" />
  </div>
  `;
};

export const renderSmallEmoji = (graphic, cls) => `
<span class="GraphNavigation withGraphic">
  <span style="position: relative; border-width:1px !important;width:4rem;height:4rem;display:inline-block;margin: 0 0 -0.5rem 0;" class="GraphNavigation-State State ${cls||''}">${graphic?`<img src="${graphicsUrl(graphic)}" />`:''}</span>
</span>
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

  // HACK for the score animation
  let shadowStates = states.map(state => {
    return state
    .replaceAll("-State-", "-ShadowState-")
    .replaceAll("\"State ", "\"State ShadowState ")
  })
  window.states = states
  window.shadowStates = shadowStates

  const succ = [];
  const keys = [];
  for (const state of graph.states) {
    let [x, y] = xy.scaled[state];
    graph.successors(state).forEach((successor, idx) => {
      if (state >= successor) {
        return;
      }
      const e = xy.edge(state, successor);
      // const opacity = options.edgeShow(state, successor) ? 1 : 0;
      // opacity: ${opacity};
      succ.push(`
        <div class="GraphNavigation-edge GraphNavigation-edge-${state}-${successor}" style="
        width: ${e.norm}px;
        transform: translate(${x}px,${y}px) rotate(${e.rot}rad);
        "></div>
      `);

      // We also add the key labels here
      // addKey(successorKeys[state][idx], state, successor, e.norm);
      // addKey(successorKeys[successor][graph.successors(successor).indexOf(state)], successor, state, e.norm);
    });
  }

  return `
  <div class="GraphNavigation withGraphic" style="width: ${width}px; height: ${height}px;">
    ${keys.join('')}
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
  if (state < successor) {
    return root.querySelector(`.GraphNavigation-edge-${state}-${successor}`);
  } else {
    return root.querySelector(`.GraphNavigation-edge-${successor}-${state}`);
  }
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
    // for (const el of display_element.querySelectorAll('.GraphNavigation-edge,.GraphNavigation-key')) {
    for (const el of display_element.querySelectorAll('.GraphNavigation-edge')) {
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
    // el = display_element.querySelector(`.GraphNavigation-key-${state}-${successor}`);
    // el.classList.add('GraphNavigation-currentKey');
    // el.classList.add(`GraphNavigation-currentKey-${keyForCSSClass(successorKeys[idx])}`);
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

addPlugin('CircleGraphNavigation', trialErrorHandling(async function(root, trial) {
  const cg = new CircleGraph(root, trial);

  await cg.navigate();
  // logger('done')
  await sleep(500);
  cg.el.innerHTML = ""
  await makeButton(root, "continue", {css: {'margin-top': '-600px'}})
  // await cg.endTrialScreen();

  root.innerHTML = '';
  console.log('cg.data', cg.data);
  jsPsych.finishTrial(cg.data);
}));