import networkx as nx
import numpy as np
import random
import json
import os
import matplotlib.pyplot as plt
from scipy.stats import rv_discrete

def regular_tree(branching):
    """
    Generates a regular tree where each level has a specified number of branches.
    """
    tree = []
    
    def rec(d):
        children = []
        tree.append(children)
        idx = len(tree) - 1
        if d < len(branching):
            for i in range(branching[d]):
                child = rec(d + 1)
                children.append(child)
        return idx

    rec(0)
    return tree

def empty_tree():
    return [[]]

def tree_join(g1, g2):
    """
    Joins two trees by adding a new root node.
    """
    n1 = len(g1)
    g1 = [[y + 1 for y in x] for x in g1]
    g2 = [[y + 1 + n1 for y in x] for x in g2]
    return [[2, n1 + 2]] + g1 + g2

def random_tree(splits):
    if splits == 0:
        return empty_tree()
    if splits == 1:
        return tree_join(empty_tree(), empty_tree())

    left = random.randint(0, splits - 1)
    right = splits - 1 - left
    return tree_join(random_tree(left), random_tree(right))

def valid_reward(n,rdist):
    """
    Ensures that the reward distribution has enough elements for sampling.
    If the list of rewards is shorter than n, it extends the list with additional elements.
    """
    while len(rdist.x) < n:
        rdist.x.append(0)

def paths(problem):
    """
    Returns all paths in the problem graph.
    """
    graph = problem['graph']
    start = problem['start']
    def rec(node):
        if node == []:
            return [[]]
        else:
            paths = []
            for child in node:
                child_paths = rec(graph[child])
                for path in child_paths:
                    paths.append([child] + path)
            return paths
    return rec(graph[start])

def sample_graph(n):
    assert n % 2 != 0, "n must be odd"
    base = [[1, 2], [3, 4], [5, 6]]
    base.extend([[] for i in range(n-len(base))])
    perm = random.sample(range(len(base)), len(base))
    graph = []
    for idx in perm:
        graph.append([perm.index(i) for i in base[idx] if i != []])
    start = perm.index(0)
    return graph, perm, start

def sample_problem_(n, n_steps=-1, rdist=None, rewards=None, graph=None, start=None):
    """
    Sample a problem with n nodes and rewards given by rdist.
    """
    if graph is None:
        graph, perm, start = sample_graph(n)
    else:
        perm = list(range(n))  # No permutation if graph is already given
    if rewards is None and rdist is not None:
        rewards = rdist.rand()

    leaf_nodes = [i for i, children in enumerate(graph) if not children]
    leaf_rewards = rewards[:len(leaf_nodes)]
    all_rewards = [0] * n
    for leaf, reward in zip(leaf_nodes, leaf_rewards):
        all_rewards[leaf] = reward
    return {'graph': graph, 'reward': all_rewards, 'start': start, 'n_steps': n_steps}



def learn_reward(n, n_steps=1, rdist=None, rewards=None, graph=None, start=None):
    if graph is None:
        graph, perm, start = sample_graph(n)
        # Ensuring that the start node has two children
        if len(graph[start]) < 2:
            raise ValueError("The start node must have at least two children.")
    else:
        perm = list(range(n))  # No permutation if graph is already given

    if rewards is None and rdist is not None:
        rewards = rdist.rand()

    # Initialize all rewards to 0
    all_rewards = [0] * n

    # Assign rewards to the first two children of the start node
    if len(graph[start]) >= 2:
        all_rewards[graph[start][0]] = rewards[0]
        all_rewards[graph[start][1]] = rewards[1]

    return {'graph': graph, 'reward': all_rewards, 'start': start, 'n_steps': n_steps}


# Example usage
# Assuming functions like states, paths, and sample_graph are defined
# problem = sample_problem(n=5)
# result = default_problem_requirement(problem)
# print(result)

def sample_problem(**kwargs):
    for i in range(10000):
        problem = sample_problem_(**kwargs)
        return problem
   
def discrete_uniform(v):
    probs = np.ones(len(v)) / len(v)
    return np.random.choice(v, p=probs)

def linear_rewards(n):
    assert n % 2 == 0
    n2 = n // 2
    return list(range(-n2, 0)) + list(range(1, n2 + 1))

class Shuffler:
    def __init__(self, x):
        self.x = x
    def rand(self):
        random.shuffle(self.x)
        return self.x

class IIDSampler:
    def __init__(self, n, x):
        self.n = n
        self.x = x

    def rand(self):
        return random.sample(self.x, self.n)
    
def value(problem):
    """
    Calculate the total value of the problem, 
    presumably by summing the rewards.
    """
    return sum(problem['reward'])

import networkx as nx

def intro_graph(n):
    g = nx.DiGraph()
    g.add_nodes_from(range(1, n + 1))  # Nodes from 1 to n

    # Add edges: each node i is connected to (i + 2) % n, except the last node
    for i in range(1, n):
        g.add_edge(i, (i + 2) % n if (i + 2) % n != 0 else n)

    # Add the edge [0, 2] separately
    g.add_edge(0, 2)

    return g

def intro_problem(n, n_steps=-1, rdist=None, rewards=None, graph=None, start=None):
    if graph is None:
        graph = intro_graph(n)
    if rewards is None:
        if rdist is not None:
            rewards = rdist.rand()
        else:
            rewards = [0] * n  # Default to a list of zeros
    if len(rewards) < n:
        rewards.extend([0] * (n - len(rewards)))
    elif len(rewards) > n:
        rewards = rewards[:n]  # Truncate the list if it's longer than n
    graph_edges = [[u, v] for u, v in graph.edges()]

    random.shuffle(rewards)
    return {'graph': graph_edges, 'reward': rewards, 'start': start if start is not None else 0, 'n_steps': n_steps}


# Example usage of the functions
n = 9
v = [1, 2, 3, 4]

# Intro graph
graph = intro_problem(n)
print("Intro graph:", graph)

def make_trials():
    n = 9
    rewards = linear_rewards(8)
    rdist = IIDSampler(6, rewards) 
    kws = {'n': n, 'rdist': rdist}
    trial_sets = []

    for _ in range(5):
        problem = learn_reward(**kws)
        trial_sets.append(problem)


    learn_rewards = {'trial_sets': trial_sets}
    intro = intro_problem(**kws, rewards=[0] * n)
    collect_all = intro_problem(**kws, rewards=rewards)
    main = [sample_problem(**kws)]

    return {
        'intro': intro,
        'collect_all': collect_all,
        'learn_rewards': learn_rewards,
        'main': main
    }
    

def fixed_rewards(n):
    assert n % 2 == 0
    n2 = n // 2
    return list(range(-n2, 0)) + list(range(1, n2 + 1))

def reward_graphics(n=8):
    png = ["pattern_1.png", "pattern_2.png", "pattern_3.png", "pattern_4.png", "pattern_5.png", "pattern_6.png", "pattern_7.png", "pattern_8.png"]
    return dict(zip(linear_rewards(n), random.sample(png, n)))


# Generate trials
subj_trials = [make_trials() for _ in range(10)]

# Directory setup
dest = "static/json/config/"
os.makedirs(dest, exist_ok=True)

# Save trials as JSON
for i, trials in enumerate(subj_trials, start=1):
    parameters = {
        "rewardGraphics": reward_graphics(8),
        "hover_edges": False,
        "hover_rewards": False,
        "points_per_cent": 10,
        "use_n_steps": True,
        "vary_transition": False,
        "fixed_rewards": True
    }
    with open(f"{dest}/{i}.json", "w") as file:
        json.dump({"parameters": parameters, "trials": trials}, file)

n = 9
rewards = linear_rewards(8)
rdist = IIDSampler(6, rewards)

sampled_problem = sample_problem_(n, rdist=rdist)
learned_problem = learn_reward(n, rdist= IIDSampler(2, rewards))

# Example usage
# trials = make_trials()
# print(trials)


# Example usage
print("random tree:", random_tree(3))
print("regular tree:", regular_tree([2, 2]))  # Example of regular tree with specific branching
