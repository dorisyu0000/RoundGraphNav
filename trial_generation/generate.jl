using Graphs
using Distributions
using JSON
using Random

include("utils.jl")

struct Problem
    graph::Vector{Vector{Int}}
    rewards::Vector{Int}
    start::Int
    n_steps::Int
end

# converts to 0 indexing
function JSON.lower(problem::Problem)
    (;
        graph = map(x -> x .- 1, problem.graph),
        problem.rewards,
        start = problem.start - 1,
        problem.n_steps,
        # value = value(problem)
    )
end

Base.Broadcast.broadcastable(x::Problem) = Ref(x)

function default_requirement(sgraph::SimpleGraph)
    is_connected(sgraph) || return false
    all(vertices(sgraph)) do v
        length(neighbors(sgraph, v)) ≥ 2
    end
end

function sample_graph(k; requirement=default_requirement)
    for i in 1:10000
        sgraph = expected_degree_graph(fill(2, k))
        requirement(sgraph) && return neighbor_list(sgraph)
    end
    error("Can't sample a graph!")
end

neighbor_list(sgraph::SimpleGraph) = neighbors.(Ref(sgraph), vertices(sgraph))

function sample_problem(;k, n_steps, graph=sample_graph(k),
                        rdist=nothing, rewards=rand(rdist, k), start=rand(1:k))
    Problem(graph, rewards, start, n_steps)
end

function sample_problem(requirement; kws...)
    for i in 1:10000
        problem = sample_problem(;kws...)
        requirement(problem) && return problem
    end
    error("Can't sample a problem!")
end

function paths(problem::Problem)
    frontier = [[problem.start]]
    result = Vector{Int}[]

    function search!(path)
        if length(path) == problem.n_steps + 1
            push!(result, path)
            return
        end
        loc = path[end]
        for child in problem.graph[loc]
            push!(frontier, [path; child])
        end
    end
    while !isempty(frontier)
        search!(pop!(frontier))
    end
    [pth[1:end] for pth in result]
end

function value(problem::Problem, path)
    sum(unique(path)[2:end]) do s
        problem.rewards[s]
    end
end

function value(problem::Problem)
    maximum(paths(problem)) do pth
        value(problem, pth)
    end
end

# %% --------
discrete_uniform(v) = DiscreteNonParametric(v, ones(length(v)) / length(v))

function make_trials(i; k=8, rdist=discrete_uniform([-10, -5, 5, 10]))
    Random.seed!(i)

    graph = neighbor_list(random_regular_graph(k, 3))

    intro = sample_problem(;k, graph, n_steps=-1, rewards=zeros(k))
    collect_all = sample_problem(;k, graph, n_steps=-1, rewards = shuffle(repeat([-10, -5, 5, 10], 2)))

    easy = sample_problem(;k, graph, n_steps=1, rewards=zeros(k))
    step1_rewards!(problem, rewards) = problem.rewards[graph[problem.start]] .= rewards
    step1_rewards!(easy, [-10, -5, 10])

    trial_sets = map(1:5) do _
        rs = support(rdist)
        map(shuffle(repeat(2:length(rs), 2))) do i
            problem = sample_problem(;k, graph, n_steps=1, rewards=zeros(k))
            step1_rewards!(problem, shuffle([rs[i], rs[i-1], rand(rs[1:i-1])]))
            problem
        end
    end
    learn_rewards = (;trial_sets)

    move2 = [sample_problem(;k, rdist=discrete_uniform([5,10]), graph, n_steps=2) for i in 1:1]

    practice_revealed = [sample_problem(;k, rdist, graph, n_steps) for n_steps in 3:5]
    backstep = sample_problem(;k, rdist, graph, n_steps=2, rewards=fill(-10, k))
    step1_rewards!(backstep, [10, -5, -5])

    # move1, move2, move3 = map(1:3) do n_steps
    #     [sample_problem(;k, rdist, graph, n_steps) for i in 1:3]
    # end

    vary_transition = [sample_problem(;k, rdist, n_steps) for n_steps in shuffle(2:4)]
    intro_hover = sample_problem(;k, rdist, n_steps = -1)
    practice_hover = [sample_problem(;k, rdist, n_steps) for n_steps in shuffle(2:4)]

    main = [sample_problem(;k, rdist, n_steps) for n_steps in shuffle(repeat(2:5, 8))]

    (;
        intro,
        collect_all,
        practice_revealed,
        learn_rewards,
        move2,
        backstep,
        vary_transition,
        intro_hover,
        practice_hover,
        main
    )
end

parameters = (
    rewardGraphics = Dict("-10" => "🤡", "-5" => "📌", "5" => "🍫", "10" => "💰"),
    hover_edges = true,
    hover_rewards = true,
    points_per_cent = 10,
)


subj_trials = make_trials.(1:30)

dest = "/Users/fred/heroku/graph-nav/static/json/config/"
mkpath(dest)
foreach(enumerate(subj_trials)) do (i, trials)
    write("$dest/$i.json", json((;parameters, trials)))
end

map(subj_trials) do trials
    (50 + sum(value.(trials.main))) / (parameters.points_per_cent * 100)
end

