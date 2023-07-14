using Graphs

model_dir = "/Users/fred/projects/graphnav/model"
include("$model_dir/problem.jl")
include("$model_dir/utils.jl")

# function default_graph_requirement(sgraph)
#     is_connected(sgraph) || return false
#     # all(vertices(sgraph)) do v
#     #     length(neighbors(sgraph, v)) ≥ 1
#     # end
# end

# function sample_graph(n; d=3, requirement=default_graph_requirement)
#     for i in 1:10000
#         sgraph = expected_degree_graph(fill(d, n)) |> random_orientation_dag
#         # sgraph = expected_degree_graph(fill(2, n))
#         requirement(sgraph) && return neighbor_list(sgraph)
#     end
#     error("Can't sample a graph!")
# end

function sample_graph(n, start)
    g = DiGraph(n)
    done = falses(n)
    function rec(s, possible_descendents)
        done[s] && return
        done[s] = true
        n_child = min(2, length(possible_descendents))
        children = sample(possible_descendents, n_child; replace=false)
        for s′ in children
            add_edge!(g, s, s′)
            rec(s′, setdiff(possible_descendents, s′))
        end
    end
    rec(start, setdiff(1:n, start))
    neighbor_list(g)
end


neighbor_list(sgraph) = neighbors.(Ref(sgraph), vertices(sgraph))

function default_problem_requirement(problem)
    n_steps = problem.n_steps
    if n_steps == -1
        n_steps = length(states(problem))
    end
    length(paths(problem; n_steps)) ≥ 2
end

function sample_problem_(;n, n_steps=-1, start=rand(1:n), graph=sample_graph(n, start),
                        rdist=nothing, rewards=rand(rdist))
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
        add_edge!(g, i, mod1(i+1, n))
        add_edge!(g, i, mod1(i-2, n))
        # add_edge!(g, i, mod1(i+6, n))
    end
    g
end

function linear_rewards(n)
    @assert iseven(n)
    n2 = div(n,2)
    [-n2:1:-1; 1:1:n2]
end

function exponential_rewards(n; base=2)
    @assert iseven(n)
    n2 = div(n,2)
    v = base .^ (0:1:n2-1)
    sort!([-v; v])
end

function sample_nonmatching_perm(x)
    while true
        y = shuffle(x)
        if all(y .≠ x)
            return y
        end
    end
end

function sample_pairs(x)
    x = shuffle(x)
    y = sample_nonmatching_perm(x)
    collect(zip(x, y))
end

struct Shuffler{T}
    x::Vector{T}
end

function Random.rand(rng::AbstractRNG, s::Random.SamplerTrivial{<:Shuffler})
    shuffle(s[].x)
end

struct IIDSampler{T}
    n::Int
    x::Vector{T}
end

function Random.rand(rng::AbstractRNG, s::Random.SamplerTrivial{<:IIDSampler})
    (;n, x) = s[]
    rand(x, n)
end


struct ForceHoverTrial
    p::Problem
    expansions::Vector{Tuple{Int, Int}}
end

function JSON.lower(t::ForceHoverTrial)
    (;JSON.lower(t.p)..., expansions=map(e -> e .- 1, t.expansions))
end

abstract type HoverGenerator end

function ForceHoverTrial(gen::HoverGenerator; kws...)
    problem = sample_problem(;kws...)
    expansions = generate(gen, problem)
    ForceHoverTrial(problem, expansions)
end


struct RolloutGenerator <: HoverGenerator
    n::Int
end

function generate(g::RolloutGenerator, problem::Problem)
    mapreduce(vcat, 1:g.n) do i
        sliding_window(rollout(problem), 2)
    end
end

sliding_window(xs, n) = [(xs[i], xs[i+1]) for i in 1:length(xs)-1]

function rollout(p::Problem)
    res = [p.start]
    n_steps = p.n_steps <= 0 ? 100 : p.n_steps
    for i in 1:n_steps
        childs = children(p, res[end])
        isempty(childs) && break
        push!(res, rand(childs))
    end
    res
end

struct RandomGenerator <: HoverGenerator
    n::Int
end

function generate(g::RandomGenerator, problem::Problem)
    repeatedly(g.n) do
        a = rand(states(problem))
        b = rand(children(problem, a))
        (a, b)
    end
end

function make_trials(; n=8, )
    graph = neighbor_list(intro_graph(n))
    rewards = exponential_rewards(n)
    rdist = IIDSampler(n, rewards)
    # rdist = Shuffler(rewards)

    # rewards = shuffle(repeat([-10, -5, 5, 10], cld(n, 4)))[1:n]
    kws = (;n, rdist)

    intro = sample_problem(;graph, kws..., rewards=zeros(n))
    prms = grid(
        n_roll = [1,2,4,8],
    )

    main = map(repeat(prms[:], 6)) do (;n_roll)
        ForceHoverTrial(RolloutGenerator(n_roll); kws...)
    end |> shuffle

    (;
        test = ForceHoverTrial(RolloutGenerator(1); kws...),
        intro,
        practice_revealed = [sample_problem(;kws...) for i in 1:2],
        intro_hover = ForceHoverTrial(RolloutGenerator(2); kws...),
        practice_hover = [sample_problem(;kws...) for i in 1:2],
        main,
        vary_transition = sample_problem(;n, rdist),
        # calibration = intro,
        # eyetracking = [sample_problem(;kws..., n_steps) for n_steps in shuffle(repeat(3:5, 7))]
    )
end


# %% --------

function reward_graphics(n=8)
    emoji = [
        "🎈","🎀","📌","✏️","🔮","⚙️","💡","⏰",
        "✈️","🍎","🌞","⛄️","🐒","👟","🤖",
    ]
    Dict(zip(exponential_rewards(n), sample(emoji, n; replace=false)))
end

version = "v14"
Random.seed!(hash(version))
subj_trials = repeatedly(make_trials, 30)

# %% --------

base_params = (
    eye_tracking = false,
    hover_edges = true,
    hover_rewards = true,
    points_per_cent = 2,
    use_n_steps = false,
    vary_transition = true,
    # linear_rewards = true,
)

dest = "static/json/config"
rm(dest, recursive=true)
mkpath(dest)
foreach(enumerate(subj_trials)) do (i, trials)
    parameters = (;
        base_params...,
        rewardGraphics = reward_graphics(8),
    )
    write("$dest/$i.json", json((;parameters, trials)))
    println("$dest/$i.json")

end

# %% --------

value(t::ForceHoverTrial) = value(t.p)

bonus = map(subj_trials) do trials
    trials = mapreduce(vcat, [:main, :eyetracking]) do t
        get(trials, t, [])
    end
    points = 50 + sum(value.(trials))
    points / (base_params.points_per_cent * 100)
end

using UnicodePlots
if length(bonus) > 1
    display(histogram(bonus, nbins=10, vertical=true, height=10))
end
