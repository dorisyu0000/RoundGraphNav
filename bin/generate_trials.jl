using Graphs

model_dir = "/Users/fred/projects/graphnav/model"
include("$model_dir/problem.jl")
include("$model_dir/utils.jl")

function default_graph_requirement(sgraph)
    is_connected(sgraph) || return false
    # all(vertices(sgraph)) do v
    #     length(neighbors(sgraph, v)) ≥ 1
    # end
end

function sample_graph(n; d=3, requirement=default_graph_requirement)
    for i in 1:10000
        sgraph = expected_degree_graph(fill(d, n)) |> random_orientation_dag
        # sgraph = expected_degree_graph(fill(2, n))
        requirement(sgraph) && return neighbor_list(sgraph)
    end
    error("Can't sample a graph!")
end

neighbor_list(sgraph) = neighbors.(Ref(sgraph), vertices(sgraph))

function default_problem_requirement(problem)
    n_steps = problem.n_steps
    if n_steps == -1
        n_steps = length(states(problem))
    end
    length(paths(problem; n_steps)) ≥ 2
end

function sample_problem_(;n, n_steps=-1, graph=sample_graph(n),
                        rdist=nothing, rewards=rand(rdist, n), start=rand(1:n))
    rewards = copy(rewards)
    rewards[start] = 0
    Problem(graph, rewards, start, n_steps)
end

function sample_problem(requirement=default_problem_requirement; kws...)
    for i in 1:10000
        problem = sample_problem_(;kws...)
        requirement(problem) && return problem
    end
    error("Can't sample a problem!")
end

discrete_uniform(v) = DiscreteNonParametric(v, ones(length(v)) / length(v))

function intro_graph(n)
    g = DiGraph(n)
    for i in 1:n
        add_edge!(g, i, mod1(i+3, n))
        add_edge!(g, i, mod1(i-2, n))
        # add_edge!(g, i, mod1(i+6, n))
    end
    g
end

function make_trials(; n=8, rdist=discrete_uniform([-10, -5, 5, 10]))
    graph = neighbor_list(intro_graph(n))
    rewards = shuffle(repeat([-10, -5, 5, 10], cld(n, 4)))[1:n]
    kws = (;n, graph, rewards)

    function step1_rewards!(problem, rewards)
        problem.rewards[graph[problem.start]] .= rewards
    end

    trial_sets = map(1:5) do _
        rs = support(rdist)
        map(shuffle(repeat(2:length(rs), 2))) do i
            problem = sample_problem(;n, graph, n_steps=1, rewards=zeros(n))
            step1_rewards!(problem, shuffle([rs[i], rand(rs[1:i-1])]))
            problem
        end
    end
    learn_rewards = (;trial_sets)

    (;
        intro = sample_problem(;kws..., rewards=zeros(n)),
        collect_all = sample_problem(;kws...),
        learn_rewards,
        move2 = [sample_problem(;kws..., n_steps=2) for _ in 1:3],
        practice_revealed = [sample_problem(;kws..., n_steps) for n_steps in 2:4],
        calibration = mutate(intro, graph=neighbor_list(cycle_digraph(n)), n_steps=n),
        vary_transition = sample_problem(;n, rdist),
        intro_hover = sample_problem(;n, rdist),
        practice_hover = [sample_problem(;n, rdist) for i in (1:3)],
        main = [sample_problem(;graph, rewards, n, rdist, n_steps) for n_steps in repeat(3:5, 10)]
    )
end

# %% --------

parameters = (
    rewardGraphics = Dict("-10" => "🤡", "-5" => "📌", "5" => "🍫", "10" => "💰"),
    hover_edges = false,
    hover_rewards = false,
    points_per_cent = 5,
    use_n_steps = true,
    vary_transition = false,
    eye_tracking = false,
    fixed_rewards = true,
)

version = "test"
Random.seed!(hash(version))
subj_trials = repeatedly(make_trials, 1)

# %% --------

dest = "static/json/config/"
rm(dest, recursive=true)
mkpath(dest)
foreach(enumerate(subj_trials)) do (i, trials)
    write("$dest/$i.json", json((;parameters, trials)))
end

# %% --------

# bonus = map(subj_trials) do trials
#     (50 + sum(value.(trials.main))) / (parameters.points_per_cent * 100)
# end
# using UnicodePlots
# histogram(bonus, nbins=10, vertical=true, height=10)

