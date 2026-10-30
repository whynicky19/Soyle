def test_pet_settings_are_child_scoped_and_persistent(client, parent_headers, student_headers, admin_headers):
    child = client.get('/api/auth/me', headers=student_headers).json()['child_id']
    url = f'/api/children/{child}/pet-settings'
    defaults = {'visible': True, 'voice': False, 'motion': 'full'}
    assert client.get(url, headers=student_headers).json() == defaults
    preferences = {'visible': False, 'voice': True, 'motion': 'off'}
    assert client.put(url, headers=student_headers, json=preferences).json() == preferences
    assert client.get(url, headers=parent_headers).json() == preferences
    other = client.post('/api/children', headers=parent_headers, json={'name': 'Тест питомца', 'birth_date': '2020-01-01'}).json()['id']
    other_url = f'/api/children/{other}/pet-settings'
    assert client.get(other_url, headers=parent_headers).json() == defaults
    assert client.get(other_url, headers=student_headers).status_code == 403
    assert client.put(other_url, headers=student_headers, json=preferences).status_code == 403
    assert client.put(url, headers=admin_headers, json=preferences).status_code == 403
    assert client.put(url, headers=student_headers, json={**preferences, 'motion': 'wild'}).status_code == 422
    assert client.put(url, headers=student_headers, json=defaults).json() == defaults
