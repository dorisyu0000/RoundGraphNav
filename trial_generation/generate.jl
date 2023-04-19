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
        graph = expected_degree_graph(fill(2, k))
        requirement(graph) && return graph
    end
    error("Can't sample a graph!")
end

function sample_problem(;k=8, n_steps=3, graph=nothing, requirement=x->true)
    fixed_graph = !isnothing(graph)
    rdist = DiscreteNonParametric([-10, -5, 5, 10], ones(4) / 4)
    for i in 1:10000
        if !fixed_graph
            sgraph = sample_graph(k)
            graph = neighbors.(Ref(sgraph), vertices(sgraph))
        end
        problem = Problem(
            graph,
            rand(rdist, k),
            rand(1:k),
            n_steps
        )
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

# %% --------

function make_trials()
    # easy choice problem between -10, -5, and 10
    requirement = (problem) -> begin
        step1_rewards = problem.rewards[problem.graph[problem.start]]
        sort(step1_rewards) == [-10, -5, 10]
    end
    easy = sample_problem(;n_steps=1, requirement)
    easy_max = 10
    graph = easy.graph
    k = length(graph)

    intro = mutate(easy; n_steps=-1, start = rand(setdiff(1:k, easy.start)), rewards=zeros(k))
    collect_all = mutate(intro; n_steps=-1, rewards = shuffle(repeat([-10, -5, 5, 10], 2)))
    move1 = [sample_problem(;n_steps=1, graph) for i in 1:3]
    move2 = [sample_problem(;n_steps=2, graph) for i in 1:3]
    move3 = [sample_problem(;n_steps=3, graph) for i in 1:3]

    vary_transition = [sample_problem(;n_steps) for n_steps in shuffle(2:4)]
    intro_hover = [sample_problem(;n_steps = -1)]
    practice_hover = [sample_problem(;n_steps) for n_steps in shuffle(2:4)]

    main = [sample_problem(;n_steps) for n_steps in shuffle(repeat(2:4, 10))]

    (;
        intro = [intro],
        collect_all = [collect_all],
        easy = [(;JSON.lower(easy)..., max_val = easy_max)],
        move1, move2, move3,
        vary_transition,
        intro_hover,
        practice_hover,
        main
    )
end

parameters = (
    rewardGraphics = Dict("-10" => "🤡", "-5" => "📌", "5" => "🍫", "10" => "💰"),
    n_steps = 3,
    hover_edges =  true,
    hover_rewards =  true,
)

trials = make_trials()
fp = "/Users/fred/heroku/graph-nav/static/json/test2.json"
write(fp, json((;parameters, trials)))
