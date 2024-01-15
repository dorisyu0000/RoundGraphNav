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

def calculate_path_rewards(graph, rewards, start):
    """Calculate the sum of rewards for each path in the graph."""
    path_rewards = {}
    n = len(graph)  # Number of nodes in the graph
    if len(rewards) < n:
        raise ValueError("The length of rewards must be at least as large as the number of nodes in the graph")

    for node, children in enumerate(graph):
        if node == start or node >= n:
            continue  # Skip the start node and nodes outside the range
        for child in children:
            if child == start or child >= n:
                continue
            path = tuple(sorted([node, child]))
            path_rewards[path] = rewards[node] + rewards[child]
    return path_rewards

def sample_requirement(rewards, graph, start, rdist, max_attempts=1000):
    """Iteratively resample rewards until each path has a unique sum or maximum attempts are reached."""
    for _ in range(max_attempts):
        path_rewards = calculate_path_rewards(graph, rewards, start)
        if len(set(path_rewards.values())) == len(path_rewards):
            # Unique path rewards found
            return rewards
        rewards = rdist.rand()

    # If max_attempts are reached without finding unique path rewards
    return None  # or raise an exception

def sample_graph(n,base=None):
    if base is None:
        base = [[1, 2], [3, 4], [5, 6]]
    base.extend([[] for i in range(n-len(base))])
    perm = random.sample(range(len(base)), len(base))
    graph = []
    for idx in perm:
        graph.append([perm.index(i) for i in base[idx] if i != []])
    start = perm.index(0)
    return graph, perm, start

def sample_problem_1(n, n_steps=-1, rdist=None, rewards=None, graph=None, start=None):
    if graph is None:
        graph, perm, start = sample_graph(n,base = [[1, 2], [3, 4],[5],[],[],[],[7],[8,9],[7,9],[6]])
    else:
        perm = list(range(n))
    if rewards is None and rdist is not None:
        rewards = rdist.rand()

    rewards = sample_requirement(rewards, graph, start, rdist)

    # all_rewards = [0] * n
    #  # Assign rewards to non-leaf nodes, excluding the start node
    # non_leaf_nodes = set()
    # for node, children in enumerate(graph):
    #     if children and node != start:  # Exclude start node
    #         non_leaf_nodes.add(node)
    #     for child in children:
    #         if child != start:  # Exclude start node
    #             non_leaf_nodes.add(child)
    # # Distribute rewards among non-leaf, non-start nodes
    # for rewards, node in zip(rewards, non_leaf_nodes):
    #     all_rewards[node] = rewards
    return {'graph': graph, 'rewards': rewards, 'start': start, 'n_steps': n_steps}

def sample_problem_2(n, n_steps=-1, rdist=None, rewards=None, graph=None, start=None):
    """
    Sample a problem with n nodes and rewards given by rdist.
    Rewards are assigned only to non-leaf, non-start nodes.
    """
    if graph is None:
        graph, perm, start = sample_graph(n,base = [[1, 2], [3, 4],[5,6],[],[],[],[],[8],[9,8],[7]])
    else:
        perm = list(range(n))
    if rewards is None and rdist is not None:
        rewards = rdist.rand()
    rewards = sample_requirement(rewards, graph, start, rdist)
    # all_rewards = [0] * n
    # # Assign rewards to non-leaf nodes, excluding the start node
    # non_leaf_nodes = set()
    # for node, children in enumerate(graph):
    #     if children and node != start:  # Exclude start node
    #         non_leaf_nodes.add(node)
    #     for child in children:
    #         if child != start:  # Exclude start node
    #             non_leaf_nodes.add(child)
    # for reward, node in zip(rewards, non_leaf_nodes):
    #     all_rewards[node] = reward

    return {'graph': graph, 'rewards': rewards, 'start': start, 'n_steps': n_steps}




def learn_reward(n, n_steps=1, rdist=None, rewards=None, graph=None, start=None):
    if graph is None:
        base = [[1, 2]]
        graph, perm, start = sample_graph(n,base)
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

    return {'graph': graph, 'rewards': all_rewards, 'start': start, 'n_steps': n_steps}


# Example usage
# Assuming functions like states, paths, and sample_graph are defined
# problem = sample_problem(n=5)
# print(result)

def sample_problem(**kwargs):
    for i in range(10000):
        problem = sample_problem_1(**kwargs)
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
        if n <= 0:
            raise ValueError("n must be positive")
        self.n = n
        self.x = x

    def rand(self):
        return random.choices(self.x, k=self.n)
    
def value(problem):
    """
    Calculate the total value of the problem, 
    presumably by summing the rewards.
    """
    return sum(problem['rewards'])

import networkx as nx

def intro_graph(n):
    g = []
    for i in range(n):
        g.append([(i + 1)%n,(i + 3)%n])
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
        rewards = rewards[:n]  
    random.shuffle(rewards)
    return {'graph': graph, 'rewards': rewards, 'start': start if start is not None else 0, 'n_steps': n_steps}

def make_trials():
    n = 10
    rewards = [1,2,3,4,5]
    rdist = IIDSampler(n, rewards) 
    kws = {'n': n, 'rdist': rdist}
    trial_sets = []

    for _ in range(6):
        problem = learn_reward(**kws)
        trial_sets.append(problem)  
        
    main = [] 
    # problem_1 = sample_problem_1(**kws)  
    # problem_2 = sample_problem_2(**kws)
    # main.append(problem_1)
    # main.append(problem_2)

    for _ in range(20):
        n = 10
        rewards = [1,2,3,4,5]
        rdist = IIDSampler(n, rewards)
        problem = sample_problem_1(n, rdist=rdist)   
        main.append(problem)

    for _ in range(20):
        n = 10
        rewards = [1,2,3,4,5]
        rdist = IIDSampler(n, rewards)
        problem = sample_problem_2(n, rdist=rdist)   
        main.append(problem)

    learn_rewards = {'trial_sets': [trial_sets]}
    practice_revealed = [sample_problem(**kws)]
    intro_hover = sample_problem(**kws)
    practice_hover = [sample_problem(**kws)]
    intro = intro_problem(**kws, rewards=[0] * n)
    collect_all = intro_problem(**kws, rewards=rewards)
    

    return {
        'intro': intro,
        'collect_all': collect_all,
        'learn_rewards': learn_rewards,
        'practice_revealed': practice_revealed,
        'intro_hover': intro_hover,
        'practice_hover': practice_hover,
        'main': main
    }
    

def reward_contours(n=8):
    png = ["pattern_1", "pattern_2", "pattern_3", "pattern_4", "pattern_5", "pattern_6", "pattern_7", "pattern_8"]
    if len(png) < n:
        png.extend(["pattern_default"] * (n - len(png)))

    return dict(zip(linear_rewards(n), png))
from random import sample

def reward_graphics(n,rewards):
    emojis = [
        "🎈", "🎀", "📌", "🔮", "💡", "⏰",
        "🍎", "🌞", "⛄️", "🐒", "👟", "🤖",
    ]
    fixed_rewards = [str(i) for i in rewards]  # convert numbers to strings
    return dict(zip(fixed_rewards, sample(emojis, n)))

# Generate trials
subj_trials = [make_trials() for _ in range(10)]

# Directory setup
dest = "static/json/config/"
os.makedirs(dest, exist_ok=True)

# Save trials as JSON
for i, trials in enumerate(subj_trials, start=1):
    parameters = {
        "emojiGraphics": reward_graphics(5,[1,2,3,4,5]),
        "hover_edges": False,
        "hover_rewards": False,
        "points_per_cent": 5,
        "use_n_steps": True,
        "vary_transition": False,
        "fixed_rewards": True
    }
    with open(f"{dest}/{i}.json", "w", encoding='utf-8') as file:
        json.dump({"parameters": parameters, "trials": trials}, file, ensure_ascii=False)

n = 10
rewards = [-1,-2,-3, 1, 2, 3]
rdist = IIDSampler(n, rewards)
sampled_problem = sample_problem_2(n, rdist=rdist)
print("Sampled problem:", sampled_problem)

# Example usage
# trials = make_trials()
# print(trials)


# # Example usage
# print("random tree:", random_tree(3))
# print("regular tree:", regular_tree([2, 2]))  # Example of regular tree with specific branching
