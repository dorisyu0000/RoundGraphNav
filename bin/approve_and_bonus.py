#!/usr/bin/env python3
import os
import requests
import pandas as pd

TOKEN = os.getenv('PROLIFIC_TOKEN')
if not TOKEN:
    print('You must set the PROLIFIC_TOKEN environment variable to use this script.')
    exit(1)

# you can find this in the URL when you select your project on the the prolific website, e.g
# https://app.prolific.co/researcher/workspaces/projects/644364ccfceb189178b7187c
PROJECT_ID = '644364ccfceb189178b7187c'
COMPLETION_CODE = 'CITBBJYS'

def request(method, url, **kws):
    if url.startswith('/'):
        url = 'https://api.prolific.co/api/v1' + url
    if not url.endswith('/'):
        url += '/'
    r = requests.request(method, url, **kws, headers={
        'Authorization': f'Token {TOKEN}',
    })
    response = r.json()
    if r.ok:
        return response
    else:
        print(f'Bad request! {url}')
        print(response)


def get(url, **kws):
    return request('GET', url, **kws)

def post(url, json=None, **kws):
    return request('POST', url, json=json, **kws)


workspace_id = get('/workspaces/')['results'][0]

# NOTE: we're currently assuming you want to approve and bonus the last study
# you ran. This could easily be generalized of course.
study_id = get(f'/projects/{PROJECT_ID}/studies/')['results'][-1]['id']
subs = get(f'/studies/{study_id}/submissions')['results']

# approve
to_approve = []
bad_code = []
for sub in subs:
    if sub['status'] == 'APPROVED':
        pass
    elif sub['study_code'] == COMPLETION_CODE:
        to_approve.append(sub["participant_id"])
    elif sub['status'] != 'RETURNED':
        bad_code.append(sub["participant_id"])

if bad_code:
    print(f'{len(bad_code)} submissions have an incorrect code. Check',
        f"https://app.prolific.co/researcher/workspaces/studies/{study_id}/submissions")

if to_approve:
    post("/submissions/bulk-approve/", {
        "study_id": study_id,
        "participant_ids": to_approve
    })
    print(f'Approved {len(to_approve)} submissions')
else:
    print('All sumssions have already been approved')

completed = [s for s in subs if s['status'] != 'RETURNED']
completion_time = pd.Series({sub['participant_id']: sub['time_taken'] for sub in completed}).dropna() / 60
print(f'Median completion time: {round(completion_time.median())} minutes')

# bonus
bonus = pd.read_csv('bonus.csv', header=None, names=['participant_id', 'bonus']).set_index('participant_id')
previous_bonus = pd.Series({sub['participant_id']: sum(sub['bonus_payments']) for sub in completed})
n_bonused = sum(previous_bonus > 0)
if n_bonused:
    print(f'{n_bonused} participants already have bonuses, {len(bonus) - n_bonused} to be bonused')

missing = set(bonus.index) - set(previous_bonus.index)
if missing:
    print('WARNING: some entries of bonus.csv do not have submissions. Skipping these.')
    for m in missing:
        print('  ', m)
    # exit(1)

bonus_string = bonus.loc[previous_bonus.where(lambda x: x == 0).dropna().index].to_csv(header=False)
if bonus_string:
    resp = post('/submissions/bonus-payments/', {
        'study_id': study_id,
        'csv_bonuses': bonus_string
    })

    amt = resp['total_amount'] / 100
    yes = input(f'Pay ${amt:.2f} in bonuses? [N/y]: ')
    if yes == 'y':
        post(f'/bulk-bonus-payments/{resp["id"]}/pay/')
        print('Bonuses paid')
    else:
        print('NOT paying bonuses')
