#!env/bin/python
import os
import subprocess
import pandas as pd
from argparse import ArgumentParser, ArgumentDefaultsHelpFormatter
import hashlib
import json
from datetime import datetime

# set environment parameters so that we use the remote database

def get_database():
    if os.path.isfile('.database_url'):
        with open('.database_url') as f:
            return f.read()
    else:
        cmd = "heroku config:get DATABASE_URL"
        url = subprocess.check_output(cmd, shell=True).strip().decode('ascii')
        with open('.database_url', 'w') as f:
            f.write(url)
            return url

env = os.environ
env["PORT"] = ""
env["ON_CLOUD"] = "1"
env["DATABASE_URL"] = get_database()

from psiturk.models import Participant  # must be imported after setting params

class Anonymizer(object):
    def __init__(self):
        self.mapping = {}

    def __call__(self, uniqueid):
        worker_id, assignment_id = uniqueid.split(':')
        if worker_id not in self.mapping:
            self.mapping[worker_id] = 'w' + hashlib.md5(worker_id.encode()).hexdigest()[:7]
        return self.mapping[worker_id]


def write_csvs(version, debug):
    ps = Participant.query.filter(Participant.codeversion == version).all()
    if not debug:
        ps = [p for p in ps if 'debug' not in p.uniqueid]
    complete = sum(1 for p in ps if p.status == 3)
    print(f'{len(ps)} participants, {complete} completed')

    anonymize = Anonymizer()

    # Note: we don't filter by completion status.

    def qdata(p):
        '''
        A hack: to avoid needing to attach condition and other metadata to
        every participant's qdata, we just sprinkle it in here from the DB.
        '''
        rows = p.get_question_data()
        if rows:
            assert rows[-1] == '\n'
        rows += f'{p.uniqueid},condition,{p.cond}\n'
        rows += f'{p.uniqueid},counterbalance,{p.counterbalance}\n'
        rows += f'{p.uniqueid},status,{p.status}\n'
        return rows

    # https://github.com/NYUCCL/psiTurk/blob/master/psiturk/models.py
    contents = {
        "trialdata": lambda p: p.get_trial_data(),
        "eventdata": lambda p: p.get_event_data(),
        "questiondata": qdata,
    }

    for filename in ["trialdata", "eventdata", "questiondata"]:

        data = []
        for p in ps:
            try:
                data.append(contents[filename](p))
            except:
                import traceback
                traceback.print_exc()
        data = "".join(data)

        # write out the data file

        dest = os.path.join('data/human_raw', version, "{}.csv".format(os.path.splitext(filename)[0]))
        if not os.path.exists(os.path.dirname(dest)):
            os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(dest, "w") as fh:
            fh.write(data)

        # Anonymize PIDs
        df = pd.read_csv(dest, header=None)
        df[0] = df[0].map(anonymize)
        df.to_csv(dest, header=None, index=False)

    fp = os.path.join('data/human_raw', version, "identifiers.csv")
    pd.Series(anonymize.mapping, name='wid').to_csv(fp, index_label='workerid')


def reformat(version):
    os.makedirs(f'data/human/{version}', exist_ok=True)

    def parse_row(row):
        data = json.loads(row.data)
        data['wid'] = row.wid
        return data

    # trial json
    df = pd.read_csv(f"data/human_raw/{version}/trialdata.csv", header=None,
        names = ["wid", "idx", "timestamp", "data"])
    data = [parse_row(row) for row in df.itertuples()]
    to_save = ['learn_rewards', 'main', 'survey-text', 'calibration']
    names = {'main': 'trials', 'survey-text': 'survey'}
    for t in to_save:
        typs = [d.get('trial_type') for d in data]
        trials = [d for d in data if d.get('trial_type') == t]
        if t == 'survey-text':
            for i in range(len(trials)):
                trials[i] = {
                    'wid': trials[i]['wid'],
                    **json.loads(trials[i]['responses'])
                }

            pd.DataFrame(trials).to_csv(f'data/human/{version}/survey.csv', index=False)
        else:
            with open(f'data/human/{version}/{names.get(t, t)}.json', 'w') as f:
                json.dump(trials, f)

    # participants.csv
    qdata = pd.read_csv(f"data/human_raw/{version}/questiondata.csv", header=None,
        names = ["wid", "key", "value"])
    participants = pd.pivot(qdata, index='wid', columns='key', values='value')
    participants.to_csv(f'data/human/{version}/participants.csv')

    # bonus.csv
    identifiers = pd.read_csv(f'data/human_raw/{version}/identifiers.csv').set_index('wid')
    identifiers.join(participants.bonus).dropna().to_csv('bonus.csv', index=False, header=False)


def main(version, debug, nofetch):
    if not nofetch:
        write_csvs(version, debug)
    reformat(version)

if __name__ == "__main__":
    parser = ArgumentParser(
        formatter_class=ArgumentDefaultsHelpFormatter)
    parser.add_argument(
        "version",
        nargs="?",
        help=("Experiment version. This corresponds to the experiment_code_version "
              "parameter in the psiTurk config.txt file that was used when the "
              "data was collected."))
    parser.add_argument("--nofetch", action="store_true")
    parser.add_argument("--debug", help="Keep debug participants", action="store_true")

    args = parser.parse_args()
    version = args.version
    if version == None:
        import configparser
        c = configparser.ConfigParser()
        c.read('config.txt')
        version = c["Task Parameters"]["experiment_code_version"]
        print("Fetching data for current version: ", version)

    main(version, args.debug, args.nofetch)
