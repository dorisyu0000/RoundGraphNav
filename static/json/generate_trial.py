import json
import os
import random 

# Let's first read the provided JSON file to understand its structure and parameters
file_path = '/Users/dorisyu/RoundNavCopy/static/json/config/1.json'

with open(file_path, 'r') as file:
    original_json = json.load(file)

def generate_json(original_json):
    # Using the specified emoji graphics
    emoji_graphics = {
        "1": "🍪", "2": "📌", "3": "🤡", "4": "🍫",
        "5": "💰", "6": "🔮", "7": "🔨", "8": "🛒",
        "9": "📚", "10": "🌞"
    }

    # Parameters with hover_edges and hover_rewards set to false
    parameters = {
        "hover_edges": False,
        "hover_rewards": False,
        "emojiGraphics": emoji_graphics
    }

    # Function to generate a trial with the specified graph and reward structure
    def generate_trial():
        # Randomly choose a start number between 1 and 7
        start = random.randint(1, 7)

        # Initialize the graph with 8 empty arrays
        graph = [[] for _ in range(8)]

        # Fill the start array with 2 unique numbers between 0 and 7, excluding the start number
        choices = [i for i in range(8) if i != start]
        graph[start] = random.sample(choices, 2)

        # Fill the arrays at the positions specified in the start array
        for num in graph[start]:
            new_choices = [i for i in choices if i not in graph[start] and i != num]
            graph[num] = random.sample(new_choices, 2)

        # Define rewards for each array
        rewards = [random.randint(1, 10) if len(arr) > 0 else 0 for arr in graph]

        return {
            "n_step": -1,
            "graph": graph,
            "rewards": rewards,
            "start": start
        }

    # Constructing trials
    trials = {
        "intro": generate_trial(),
        "collect_all": generate_trial(),
        "learn_rewards": {
            "trial_sets": [generate_trial() for _ in range(len(original_json['trials']['learn_rewards']['trial_sets']))]
        }
    }

    # Constructing the final JSON structure
    custom_json = {
        "parameters": parameters,
        "trials": trials,
        "emojiGraphics": emoji_graphics
    }

    return custom_json

# Generate the custom JSON data with 30 trials based on the original JSON structure
json_data = generate_json(original_json)

# Define the file name
file_name = 'test_trial.json'

# Get the absolute path of the current directory
current_directory = os.path.dirname(os.path.realpath(__file__))

# Combine them to form the full file path
json_file_path = os.path.join(current_directory, file_name)

# Writing JSON data to the file
with open(json_file_path, 'w') as file:
    json.dump(json_data, file, indent=4)
