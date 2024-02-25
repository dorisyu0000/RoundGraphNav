
import { numString, markdown, makePromise, parseHTML, trialErrorHandling, graphicsUrl, sleep, addPlugin, documentEventPromise, invariant, makeButton } from './utils.js';
import { Graph } from './graphs.js';

import { numString, markdown, makePromise, parseHTML, trialErrorHandling, graphicsUrl, sleep, addPlugin, documentEventPromise, invariant, makeButton } from './utils.js';
import { Graph } from './graphs.js';
import _ from '../../lib/underscore-min.js';
import $ from '../../lib/jquery-min.js';
import jsPsych from '../../lib/jspsych-exported.js';
import { bfs } from './graphs.js';

const BLOCK_SIZE = 100;
window.$ = $
const colors = ["#00000"]
// ["#E57373", "#64B5F6", "#81C784", "#FFF176"];


// descirbe the graph
/**
 * @typedef {Object} CircleGraphOptions
 * @property {number[][]} graph - Adjacency matrix of the graph.
 * @property {number} start - Starting state.
 * @property {number} goal - Goal state.
 * @property {number} n_steps - Number of steps allowed.
 * @property {number[]} rewards - Reward for each state.
 * @property {string[]} emojiGraphics - Graphics for each reward.
 * @property {boolean} consume - Whether to consume rewards.
 * @property {boolean} edgeShow - Whether to show edges.
 * @property {boolean} show_steps - Whether to show steps.
 * @property {boolean} show_points - Whether to show points.
 * @property {boolean} hover_rewards - Whether to show rewards on hover.
 * @property {boolean} hover_edges - Whether to show edges on hover.
 * @property {boolean} probe - Whether to show probe.
 * @property {boolean} leave_state - Whether to leave state on completion.
 * @property {boolean} leave_open - Whether to leave open on completion.
 * @property {boolean} show_current_edges - Whether to show current edges.
 * @property {string[][]} successorKeys - Keys for each successor.
 * @property {function} successorKeysRender - Render function for successor keys.
 * @property {function} onStateVisit - Callback for state visit.
 * @property {function} dynamicProperties - Dynamic properties.
 */

export class CircleGraph {
  constructor(root, options) {

    this.keyPressCounter = 0; 
    this.colorSwapped = false;
    this.orangeLineState = this.state;

    this.root = $(root)
    window.cg = this
    console.log('CircleGraph', options)

    if (options.dynamicProperties) {
      Object.assign(options, options.dynamicProperties());
    }

    let gro = options.graphRenderOptions;
    gro.successorKeysRender = gro.successorKeysRender || (key => key);
    options.successorKeys = ['1', '2', '3', '4']

    this.options = options;
    options.consume = options.consume ?? true
    options.edgeShow = options.edgeShow ?? (() => true);
    options.successorKeys = options.graphRenderOptions.successorKeys
    options.show_steps = options.show_steps ?? options.n_steps > 0
    options.show_points = options.show_points ?? true


    this.rewards = [...options.rewards] ?? Array(options.graph.length).fill(null)
    this.onStateVisit = options.onStateVisit ?? ((s) => { })
    this.score = options.score ?? 0

    if (options.consume) {
      this.rewards[options.start] = null
    }
    options.emojiGraphics[0] = options.emojiGraphics[0] ?? ""
    options.graphics = this.rewards.map(x => options.emojiGraphics[x])

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
    this.setupLogging()
  }


  showGraph() {
    this.root.append(this.wrapper)
    this.setupMouseTracking()

    $(`.ShadowState img`).remove()
    if (!this.options.show_steps) {
      $("#gn-steps").hide()
    }
    if (!this.options.show_points) {
      $("#gn-points").hide()
    }
  }

  async removeGraph() {
    $(this.el).animate({ opacity: 0 }, 300);
    await sleep(300)
    this.el.innerHTML = ""
    $(this.el).css({ opacity: 1 });
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
    await makeButton(this.root, 'start', { css: { 'margin-top': '210px' }, post_delay: 0 })
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
    this.data = {
      events: [],
      trial: _.pick(this.options, 'graph', 'n_steps', 'rewards', 'start', 'hover_edges', 'hover_rewards', 'trialNumber', 'bonus'),
    }
    let start_time = Date.now()
    this.logger = function (event, info = {}) {
      if (this.logger_callback) this.logger_callback(event, info)
      if (!event.startsWith('mouse')) {
        console.log(event, info)
      }


      // console.log(event, info)
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

    if (this.mouseTrackingEnabled) return
    this.mouseTrackingEnabled = true

    for (const el of this.el.querySelectorAll('.State:not(.ShadowState)')) {
      const state = parseInt(el.getAttribute('data-state'), 10);
      el.addEventListener('mouseenter', (e) => {
        this.logger('mouseenter', { state })
        el.classList.add('is-visible');
        for (const successor of this.graph.successors(state)) {
          $(`.GraphNavigation-edge-${state}-${successor}`).addClass('is-visible')
        }
        for (const pred of this.graph.predecessors(state)) {
          $(`.GraphNavigation-edge-${pred}-${state}`).addClass('is-visible')
        }
      });
      
      el.addEventListener('mouseleave', (e) => {
        this.logger('mouseleave', { state })
        el.classList.remove('is-visible');
        for (const successor of this.graph.successors(state)) {
          $(`.GraphNavigation-edge-${state}-${successor}`).removeClass('is-visible')
        }
        for (const pred of this.graph.predecessors(state)) {
          $(`.GraphNavigation-edge-${pred}-${state}`).removeClass('is-visible')
        }
      });
    }
  }

  

  async getKeyResponse() {
    return new Promise((resolve) => {
      const keyHandler = (info) => {

        const input_key = jsPsych.pluginAPI.convertKeyCodeToKeyCharacter(info.key);


        if (input_key === 'j') {
          const successors = this.graph.successors(this.state); 
          const node = this.state
          successors.forEach((successor, index) => {
            const arrowSelector = `.GraphNavigation-arrow.GraphNavigation-edge-${node}-${successor} .triangle`;
            const arrowElement = this.el.querySelector(arrowSelector);
            if (arrowElement && getComputedStyle(arrowElement).fill === 'rgb(255, 128, 0)') {
              this.orangeLineState = successor
          // const input_key = jsPsych.pluginAPI.convertKeyCodeToKeyCharacter(info.key);
          // let key; // Declare the 'key' variable
          // if (input_key == 'r' || input_key == '1') {
          //      key = '1';}
          // if (input_key == 'b' || input_key == '2') {
          //      key = '2';}
 

          // if (key >= '1' && key <= '4') { 
          //       const index = parseInt(key, 10) - 1; 
          //       const validSuccessors = this.graph.successors(this.state);

          //       if (index < validSuccessors.length) { 
          //           const selectedState = validSuccessors[index];
          //           resolve({ state: selectedState });
          //       } else {}
                
          //   }else {
          //       this.showToast('Invalid selection.');
            }
          });
          if (this.orangeLineState !== null) {
            resolve({ state: this.orangeLineState });
          }
        }

        
        
        if (input_key === 'f') {
          const node = this.state; 
          const successors = this.graph.successors(node); 
          let orangeSuccessor = null; 

          successors.forEach((successor, index) => {
            const arrowSelector = `.GraphNavigation-arrow.GraphNavigation-edge-${node}-${successor} .triangle`;
            const arrowElement = this.el.querySelector(arrowSelector);


            const edgeSelector = `.GraphNavigation-edge-${node}-${successor}`;
            const edgeElements = this.el.querySelectorAll(edgeSelector);
            const arrowElements = this.el.querySelectorAll(arrowSelector);


            const color = this.colorSwapped ? (index === 0 ? "#FF8000" : "#000") : (index === 0 ? "#000" : "#FF8000");



            arrowElements.forEach(arrowEl => {
              arrowEl.style.fill = color;
            });
            edgeElements.forEach(edgeEl => {
              if (!edgeEl.classList.contains('GraphNavigation-arrow')) {
                edgeEl.style.backgroundColor = color;
              }
            });

            if (arrowElement && getComputedStyle(arrowElement).fill === 'rgb(255, 128, 0)') {
              orangeSuccessor = successor;
            }
          });
          this.orangeLineState = orangeSuccessor; 
          this.colorSwapped = !this.colorSwapped;
          console.log(this.colorSwapped)
          return
        }
      };

      if (this.keyboardListener) {
        jsPsych.pluginAPI.cancelKeyboardResponse(this.keyboardListener);
      }

      

      this.keyboardListener = jsPsych.pluginAPI.getKeyboardResponse({
        callback_function: keyHandler,
        valid_responses: jsPsych.ALL_KEYS,
        rt_method: 'performance',
        persist: true,
        allow_held_key: false
      });
      // const keyboardListener = jsPsych.pluginAPI.getKeyboardResponse({
      //   callback_function: keyHandler,
      //   valid_responses: jsPsych.ALL_KEYS,
      //   rt_method: 'performance',
      //   persist: true,
      //   allow_held_key: false
      // });
    });

  }

  // Toast massage for invalid selection
  showToast(message) {
    const toast = $('<div>')
      .addClass('toast-message')
      .text(message)
      .css({
        'display': 'none',
        'position': 'fixed',
        'top': '10%',
        'left': '50%',
        'transform': 'translateX(-50%)',
        'background-color': '#333',
        'color': 'white',
        'padding': '8px 16px',
        'border-radius': '4px',
        'box-shadow': '0 2px 4px rgba(0, 0, 0, 0.2)',
        'z-index': '1000'
      });

    $(this.root).append(toast);

    toast.fadeIn(400, function () {
      setTimeout(() => {
        toast.fadeOut(400, function () {
          toast.remove();
        });
      }, 1500);
    });
  }


  // --------------------------------
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


  keyCodeToState(keyCode) {
    /*
    Mapping keyCode to states.
    */
    const key = String.fromCharCode(keyCode).toUpperCase();
    const idx = this.options.successorKeys[this.state].indexOf(key);
    if (idx === -1) {
      return null;
    }
    const succ = this.options.graph.successors(this.state)[idx];
    if (!this.options.edgeShow(this.state, succ)) {
      return null;
    }
    return succ;
  }

  keyTransition() {
    /*
    Returns a promise that is resolved with {state} when there is a keypress
    corresponding to a valid state transition.
    */
    const p = documentEventPromise('keydown', (e) => {
      const state = this.keyCodeToState(e.keyCode);
      if (state !== null) {
        e.preventDefault();
        return { state };
      }
    });

    this.cancellables.push(p.cancel);

    return p;
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
    console.log("Click")

    return new Promise((resolve, reject) => {
      const handler = (e) => {
        const el = $(e.target).closest('.PathIdentification-selectable').get(0);
        if (!el) {
          return;
        }
        e.preventDefault();
        const state = parseInt(el.getAttribute('data-state'), 10);

        this.el.removeEventListener('click', handler);
        resolve({ state });
        resolve({ state });
      }

      this.el.addEventListener('click', handler);
    });
  }

  async addScore(points, state) {

    if (points == null) {
      return
    }

    this.setScore(this.score + points)

    let cls = {
      "-1": "loss",
      "0": "neutral",
      "1": "win"
    }[Math.sign(points)]
    let plus = (points < 0) ? "" : "+"
    let pop = $("<span>")
      .addClass('pop ' + cls)
      .text(plus + points)
      .appendTo($(`.GraphNavigation-ShadowState-${state}`))
  }

  setScore(score) {
    this.score = score;
    $("#GraphNavigation-points").html(this.score)
  }



  updateSelectedArrowColor(node, selectedSuccessorIndex) {
    const successors = this.graph.successors(node);
    successors.forEach((successor, idx) => {
      const arrowSelector = `.GraphNavigation-arrow.GraphNavigation-edge-${node}-${successor} .triangle`;
      const arrowElements = this.el.querySelectorAll(arrowSelector);
      arrowElements.forEach(arrowEl => {
        arrowEl.style.fill = idx === selectedSuccessorIndex ? "#FF8000" : "#000";
      });
    });
  }
  updateEdgeColorsForNode(node) {
    const successors = this.graph.successors(node);

    const allEdges = this.el.querySelectorAll('.GraphNavigation-edge');
    const allArrows = this.el.querySelectorAll('.GraphNavigation-arrow .triangle');
    allEdges.forEach(edge => {
      edge.style.backgroundColor = '#333';
    });
    allArrows.forEach(arrow => {
      arrow.style.fill = '#333';
    });

    successors.forEach((successor, index) => {
      const edgeSelector = `.GraphNavigation-edge-${node}-${successor}`;
      const arrowSelector = `.GraphNavigation-arrow.GraphNavigation-edge-${node}-${successor} .triangle`;

      const edgeElements = this.el.querySelectorAll(edgeSelector);
      const arrowElements = this.el.querySelectorAll(arrowSelector);

      const color = index === 0 ? "#FF8000" : "#000";

      arrowElements.forEach(arrowEl => {
        arrowEl.style.fill = color;
      });
      edgeElements.forEach(edgeEl => {
        if (!edgeEl.classList.contains('GraphNavigation-arrow')) {
          edgeEl.style.backgroundColor = color;
        }
      });
    });
  }


  visitState(state, initial = false) {

    invariant(typeof (1) == 'number')
    this.logger('visit', { state, initial })



    this.updateEdgeColorsForNode(state);

    if (!initial) {
      this.addScore(this.rewards[state], state)
    }
    if (this.options.consume) {
      this.rewards[state] = 0
      $(`.GraphNavigation-State-${state} img`).remove()
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

    while (true) { // eslint-disable-line no-constant-condition
      // State transition
      const g = this.graph;
      // Update -- get state based on getKeyResponse
      const { state } = await this.getKeyResponse();

// const {state} = await this.keyTransition()
      // this.clickTransition({
      // //   invalidStates: new Set(
      // //     g.states.filter(s => !g.successors(this.state).includes(s))
      // //   ),
      // // });
      this.visitState(state)
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
          $(`.GraphNavigation-State-${state}`).animate({ opacity: 0 }, 500)  // works because shadow state
          $('.State img').animate({ opacity: 0 }, 500)
          await sleep(1000)
          // $(this.el).animate({opacity: 0}, 500); await sleep(500)
          // $(this.el).empty()
        } else {
          await sleep(200)
          $(this.el).animate({ opacity: 0 }, 200)
          $(this.el).animate({ opacity: 0 }, 200)
          await sleep(500)
        }


        $(`.GraphNavigation-current`).removeClass('GraphNavigation-current');
        // this.setCurrentState(undefined)
        break;
      }
      await sleep(200);
      // await sleep(5)
    }
    console.log(path,"Path")
    return path
  }

  loadTrial(trial) {
    if (trial.start != undefined) this.setCurrentState(trial.start)
    this.setRewards(trial.rewards)
    this.options.n_steps = trial.n_steps ?? this.options.n_steps
  }

  setReward(state, reward) {
    this.rewards[state] = parseFloat(reward)
    let graphic = this.options.emojiGraphics[reward]
    $(`.GraphNavigation-State-${state}`).html(`
            <img src="${graphicsUrl(graphic)}" alt="Circle Graphic" style="width: 70px; height: 70px; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);max-width: 100%; max-height: 100%;border-radius: 50%;"/>

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

  <img src="${graphicsUrl(graphic)}" alt="Circle Graphic" style="width: 70px; height: 70px; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);max-width: 100%; max-height: 100%;border-radius: 50%;"/>
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
  const rangeX = maxX - minX;
  const maxY = Math.max.apply(null, fixedXY.map(xy => xy[1]));
  const minY = Math.min.apply(null, fixedXY.map(xy => xy[1]));
  const rangeY = maxY - minY;

  // We determine the appropriate scaling factor for the dimensions by comparing the
  // aspect ratio of the bounding box of the embedding with the aspect ratio of our
  // rendering viewport.
  let scale;
  if (rangeX / rangeY > widthNoMargin / heightNoMargin) {
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
    x = (x - minX) * scale + marginX;
    y = (y - minY) * scale + marginY;
    coordinate[state] = [x, y];
    // We rescale for edges/keys by centering over the origin, scaling, then translating to the original position.
    scaled[state] = [
      (x - width / 2) * scaleEdgeFactor + width / 2,
      (y - height / 2) * scaleEdgeFactor + height / 2,
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
  const norm = Math.sqrt(Math.pow(x - sx, 2) + Math.pow(y - sy, 2));
  const rot = Math.atan2(sy - y, sx - x);
  return { norm, rot };
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
      style: `transform: translate(${x - BLOCK_SIZE / 2}px,${y - BLOCK_SIZE / 2}px);
      
      `,
      style: `transform: translate(${x - BLOCK_SIZE / 2}px,${y - BLOCK_SIZE / 2}px);
      
      `,
    });
  });




  // Update2 addArrow define color
  function addArrow(state, successor, norm, rot, color) {
    const [x, y] = xy.scaled[state];
    const [sx, sy] = xy.scaled[successor];

    arrows.push(`
      <div class="GraphNavigation-arrow GraphNavigation-edge-${state}-${successor}"
      style="
      transform-origin: center;
      transform:
        translate(${sx - 35}px, ${sy - 35}px)
        rotate(${rot}rad)
        translate(-30px)
        rotate(90deg)
      ;">
      <svg height="70" width="70" style="display: block; ">
          <polygon points="
          35  , 38
          29  , 50
          41 , 50
        " class="triangle" style="fill: ${color};" /> 

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

  function addKey(key, state, successor, norm) {
    const [x, y] = xy.scaled[state];
    const [sx, sy] = xy.scaled[successor];
    const [keyWidth, keyHeight] = [20, 28]; // HACK get from CSS
    // We also add the key labels here
    const mul = keyDistanceFactor * BLOCK_SIZE / 2;
    keys.push(`
      <div class="GraphNavigation-key GraphNavigation-key-${state}-${successor} GraphNavigation-key-${keyForCSSClass(key)}" style="
        transform: translate(
          ${x - keyWidth / 2 + mul * (sx - x) / norm}px,
          ${y - keyHeight / 2 + mul * (sy - y) / norm}px)
      ">${options.successorKeysRender(key)}</div>
    `);
  }

  const succ = [];
  const arrows = [];

  for (const state of graph.states) {
    let [x, y] = xy.scaled[state];
    const successors = graph.successors(state);

    successors.forEach((successor, idx) => {
      const e = xy.edge(state, successor);
      const color = colors[idx % colors.length];

      succ.push(`
          <div class="GraphNavigation-edge GraphNavigation-edge-${state}-${successor}" style="
          width: ${e.norm}px;
          transform: translate(${x}px,${y - 1}px) rotate(${e.rot}rad);
          background-color: ${color}; 
          "></div>
        `);
      addArrow(state, successor, e.norm, e.rot, color);
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
  options.showCurrentEdges = typeof (options.showCurrentEdges) === 'undefined' ? true : options.showCurrentEdges;
  options.showCurrentEdges = typeof (options.showCurrentEdges) === 'undefined' ? true : options.showCurrentEdges;
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

  // Can call this to clcconear out current state too.
  // Can call this to clcconear out current state too.
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
  trial.n_steps = -1;
  cg = new CircleGraph($(root), trial);
  if (trial.trialNumber % 10 === 0) {
    await cg.showStartScreen(trial);
  }
  else {
    await cg.showGraph();
  }

  await cg.navigate()
  trial.bonus.addPoints(cg.score)
  cg.data.current_bonus = trial.bonus.dollars()
  console.log('cg.data', cg.data);
  $(root).empty()
  jsPsych.finishTrial(cg.data)
}));

addPlugin('break', trialErrorHandling(async function breakTrial(root, trial) {
  $(root).html(`
    <div class="GraphNavigation">
      <div class="GraphNavigation-break">
        <p>Take a break! Press spacebar to continue.</p>
      </div>
    </div>
  `);
  await waitForSpace();
  $(root).empty();
  jsPsych.finishTrial();
}));