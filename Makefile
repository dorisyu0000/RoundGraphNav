dev:
	open "http://localhost:22362/testexperiment"
	forego start -p 22362 -f Procfile.dev

dev-python: export FLASK_ENV=development
dev-python:
	python bin/herokuapp.py

experiment-scaleup:
	heroku ps:scale --app graph-nav web=1:Hobby
experiment-scaledown:
	heroku ps:scale --app graph-nav web=0:Free
