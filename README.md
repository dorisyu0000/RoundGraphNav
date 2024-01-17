# graph-nav

Navigation experiments over graphs.


## Quickstart

### Installation

Project requires Python 3.9+ and Postgres. Depending on the method of Postgres installation, you might have to set your PATH to point to Postgres binaries for Python dependency installation to succeed.

Install Python dependencies into a virtualenv:
```
python3 -m venv env
. env/bin/activate
pip install -r requirements.txt
```

```
npm install
```

In order to run the server, we use a Procfile runner, like `forego`, which you can install with:
```
brew install forego
```

### Run the server

Run the server via the Makefile:
```
. env/bin/activate
make dev
```

To run the server without a Procfile runner (`forego`) you need to run the following two commands: the Python server (with `make dev-python`) and the JavaScript bundler (with `npm run watch`).

### Try it out!

Now, try out the [entire experiment](http://localhost:22362/) or demo specific plugins:
- [GraphTraining](http://localhost:22362/testexperiment?type=GraphTraining)
- [PathIdentification](http://localhost:22362/testexperiment?type=PathIdentification)

Push to heroku once you've set it as a git remote:
```
git push heroku master
```

### Errors

_Note: These instructions are likely to be very outdated._

If you're seeing an `Library not loaded: @rpath/libssl.1.1.dylib ... Reason: image not found` error when running `./bin/psiturk-herokudb', you may need to `pip uninstall psycopg2` and run the following:
```
pip install --global-option=build_ext \
            --global-option="-I/usr/local/opt/openssl/include" \
            --global-option="-L/usr/local/opt/openssl/lib" -r requirements.txt
```

## Heroku set up

You need to use both the nodejs and python buildpacks. You can create the app with
```
heroku create PROJECTNAME --buildpack heroku/nodejs --buildpack heroku/python
```

If you already created the app, you can add an additional build pack with e.g.
```
heroku buildpacks:add heroku/python
```

Finally, create the database with
```
heroku addons:create heroku-postgresql
```

## Experiment workflow
1. Prep code! Make sure cost on consent screen (`templates/consent.html`) is up to date.
2. Update `experiment_code_version` and make a git tag marking commit the code was run with.
3. Scale up Heroku: `heroku ps:scale --app graph-nav web=1:Hobby`.
4. Using `./bin/psiturk-herokudb`, ensure `mode live`, submit with `hit create <# HIT> <payment> <expiry>`. Example is `hit create 9 4.00 1`.
5. Use sanity script to keep track of HITs & automatically scale down Heroku: `python bin/sanity.py graph-nav`.
6. Pay/Approve workers for a HIT with `worker approve --hit $HIT`. See HITs with `hit list --active`.
7. Verify all workers have been paid with `worker list --submitted`.
8. Download data with `PORT= ON_HEROKU=1 DATABASE_URL=$(heroku config:get DATABASE_URL) bin/fetch_data.py $CODE_VERSION`.


## Adding new OpenMoji

To add new OpenMoji, you need to edit `static/graph-nav/images/openmoji/copyscript.py` by adding in the new emoji to copy in. You'll first have to download the OpenMoji SVG Color pack from [their site](https://openmoji.org/) and change paths in the script to work for your installation. Then run `copyscript.py`.
