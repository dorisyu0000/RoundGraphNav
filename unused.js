addPlugin('VisitNeighbors', trialErrorHandling(async function(root, trial) {
  console.log(trial);

  function edgeShow(state, succ) {
    return trial.start == state || trial.start == succ;
  }

  const cg = new CircleGraph({...trial, edgeShow});
  root.innerHTML = `
    Visit *all* the locations connected to your starting location.
    Then return to the start place!
  `;
  root.appendChild(cg.el);
  cg.el.querySelector('.GraphNavigation-current').classList.add('GraphNavigation-visited');

  const neighbors = trial.graph.successors(trial.start);
  const data = await cg.navigate({termination: function(state, states) {
    // Kind of a HACK.
    cg.el.querySelector(`.GraphNavigation-State-${state}`).classList.add('GraphNavigation-visited');
    states = new Set(states);
    return state == trial.start && neighbors.every(n => states.has(n));
  }});

  await endTrialScreen(root);

  root.innerHTML = '';
  jsPsych.finishTrial(data);
}));

addPlugin('FollowPath', trialErrorHandling(async function(root, trial) {
  const instruction = document.createElement('div');
  instruction.classList.add('GraphNavigation-instruction');
  root.appendChild(instruction);
  instruction.innerHTML = `Press the key to reach the circle marked ${renderSmallEmoji(null, 'GraphNavigation-cue')}.`;

  const startTime = Date.now();
  const data = {states: [], times: []};

  let {path} = trial;
  if (!path) {
    console.log('WARNING: did not find path. using BFS');
    path = bfs(trial.graph, trial.start, trial.goal, {shuffleSuccessors: true}).path.concat([trial.goal]);
  }

  const cg = new CircleGraph(trial);
  root.appendChild(cg.el);

  invariant(path[0] == trial.start);
  let nextPathIndex = 1;

  while (true) { // eslint-disable-line no-constant-condition
    root.querySelector(`.GraphNavigation-State-${path[nextPathIndex-1]}`).classList.remove('GraphNavigation-cue');
    root.querySelector(`.GraphNavigation-State-${path[nextPathIndex]}`).classList.add('GraphNavigation-cue');

    // State transition
    const {state} = await cg.keyTransition();
    // Record information
    data.states.push(state);
    data.times.push(Date.now() - startTime);

    if (path[nextPathIndex] == state) {
      // they're right!
      cg.setCurrentState(state);
      nextPathIndex++;
      if (nextPathIndex == path.length) {
        break;
      }
      // Taking a pause...
      await setTimeoutPromise(200);
    } else {
      // they're wrong!
      cg.el.classList.add('animateError');
      await setTimeoutPromise(300);
      cg.el.classList.remove('animateError');
    }
  }

  await endTrialScreen(root);

  root.innerHTML = '';
  jsPsych.finishTrial(data);
}));

addPlugin('CGTransition', trialErrorHandling(async function(root, trial) {
  console.log(trial);

  const instruction = document.createElement('div');
  instruction.classList.add('GraphNavigation-instruction');
  root.appendChild(instruction);
  instruction.innerHTML = `Study the connections of the ${renderSmallEmoji(null, 'GraphNavigation-cue')}. You'll be quizzed on one of them. Press spacebar to continue.`;

  const cg = new CircleGraph({...trial, start: null});
  root.appendChild(cg.el);

  const cues = trial.cues.map(state => cg.el.querySelector(`.GraphNavigation-State-${state}`));
  cues.forEach(cue => cue.classList.add('GraphNavigation-cue'));

  await waitForSpace();

  instruction.innerHTML = '<br />';
  Array.from(cg.el.querySelectorAll('.GraphNavigation-edge')).forEach(el => { el.style.opacity = 0; });
  cues.forEach(cue => cue.classList.remove('GraphNavigation-cue'));

  await setTimeoutPromise(500);
  cg.setCurrentState(trial.start, {showCurrentEdges: false});

  const start = Date.now();
  const data = {states: [], times: []};
  let totalCorrect = 0;
  const neighbors = trial.graph.successors(trial.start);

  for (const t of _.range(neighbors.length)) {
    const left = neighbors.length-t;
    instruction.textContent = `Click on the connected locations! ${left} click${left==1?'':'s'} left.`;

    const {state} = await cg.clickTransition({invalidStates: [trial.start].concat(data.states)});
    data.states.push(state);
    data.times.push(Date.now() - start);

    const el = cg.el.querySelector(`.GraphNavigation-State-${state}`);
    el.classList.remove('PathIdentification-selectable');
    el.classList.add('GraphNavigation-cue');

    const correct = neighbors.includes(state);
    if (correct) {
      totalCorrect++;
    }
  }

  for (const succ of neighbors) {
    queryEdge(cg.el, trial.start, succ).style.opacity = 1;
  }
  // OR???
  //Array.from(cg.el.querySelectorAll('.GraphNavigation-edge')).forEach(el => { el.style.opacity = 1; });

  instruction.innerHTML = `
    You correctly guessed ${totalCorrect} out of ${neighbors.length}. Press spacebar to continue.
  `;

  for (const state of new Set(neighbors.concat(data.states))) {
    const el = cg.el.querySelector(`.GraphNavigation-State-${state}`);
    el.classList.remove('PathIdentification-selectable');

    if (neighbors.includes(state)) {
      // Correct selection
      if (data.states.includes(state)) {
        el.style.boxShadow = '0 0 0 10px #4caf50';
      // Correct, but not selected
      } else {
//        el.style.boxShadow = '0 0 0 10px red';
      }
    } else {
      // Incorrect selection
      el.style.boxShadow = '0 0 0 10px red';
    }
  }

  await waitForSpace();

  root.innerHTML = '';
  jsPsych.finishTrial(data);
}));

addPlugin('CirclePathIdentification', trialErrorHandling(async function(root, trial) {
  console.log(trial);
  if (!trial.identifyOneState) {
    throw new Error('No path selection supported. Only one-state selection.');
  }

  const mapData = await maybeShowMap(root, trial);

  const {start, goal, graphics} = trial;

  const intro = trial.copy == 'busStop' ? `
    <p>Imagine a version of this task that includes <b>instant teleportation</b> to one location of your choice. The task is otherwise exactly the same: you navigate between the same locations along the same connections, but you can also teleport to the location you choose.</p>

    <p>If you did the task again, which location would you choose to use for instant teleportation?</p>
  ` : trial.copy == 'solway2014' ? `
    <p>Plan how to get from ${renderSmallEmoji(graphics[start], 'GraphNavigation-current')} to ${renderSmallEmoji(graphics[goal], 'GraphNavigation-goal')}. Choose a location you would visit along the way.</p>
  ` : trial.copy == 'subgoal' ? `
    <p>When navigating from ${renderSmallEmoji(graphics[start], 'GraphNavigation-current')} to ${renderSmallEmoji(graphics[goal], 'GraphNavigation-goal')}, what location would you set as a subgoal? (If none, click on the goal).</p>
  ` : `ERROR: Invalid trial copy ${trial}`;

  const cg = new CircleGraph({...trial, start: null});
  cg.setCurrentState(start, {showCurrentEdges: false});
  root.innerHTML = `${intro}`;
  root.appendChild(cg.el);

  const startTime = Date.now();
  const data = {
    times: [],
    states: [],
    copy: trial.copy,
    practice: trial.practice,
  };

  const invalidStates = {
    subgoal: [trial.start],
    solway2014: [trial.start, trial.goal],
    busStop: [],
  }[trial.copy];
  const {state} = await cg.clickTransition({invalidStates});

  data.states.push(state);
  data.times.push(Date.now() - startTime);
  data.mapData = mapData;

  await endTrialScreen(root);

  root.innerHTML = '';
  jsPsych.finishTrial(data);
}));

addPlugin('AcceptRejectPractice', trialErrorHandling(async function(root, trial) {
  const {expectedResponse, acceptRejectKeys: keys} = trial;
  root.innerHTML = `
    Respond with "${expectedResponse == keys.accept ? 'Yes' : 'No'}".
    <br/><br/><br/>
    ${renderKeyInstruction(keys)}
    <br/>
  `;

  await documentEventPromise('keypress', e => {
    const input = String.fromCharCode(e.keyCode);
    if (input.toUpperCase() == expectedResponse) {
      e.preventDefault();
      return true;
    }
  });

  await endTrialScreen(root, 'Great!<br /><br />');

  root.innerHTML = '';
  jsPsych.finishTrial({practice: true});
}));

addPlugin('AcceptReject', trialErrorHandling(async function(root, trial) {
  const {start, goal, graphics, probe, acceptRejectKeys: keys} = trial;

  const mapData = await maybeShowMap(root, trial);

  const intro = `
  <p>Navigating from ${renderSmallEmoji(graphics[start], 'GraphNavigation-current')} to ${renderSmallEmoji(graphics[goal], 'GraphNavigation-goal')}.
  Will you pass ${renderSmallEmoji(graphics[probe], 'GraphNavigation-probe')}?<br />
  ${renderKeyInstruction(keys)}
  `;
  root.innerHTML = `${intro}`;
  const cg = new CircleGraph({...trial, start: null});
  cg.setCurrentState(start, {showCurrentEdges: false});
  root.appendChild(cg.el);

  const startTime = Date.now();

  const data = await documentEventPromise('keypress', e => {
    const input = String.fromCharCode(e.keyCode).toUpperCase();
    for (const response of Object.keys(keys)) {
      if (input == keys[response]) {
        e.preventDefault();
        return {response};
      }
    }
  });

  console.log(data);
  data.practice = trial.practice;
  data.rt = Date.now() - startTime;
  data.mapData = mapData;

  await endTrialScreen(root);

  root.innerHTML = '';
  jsPsych.finishTrial(data);
}));
