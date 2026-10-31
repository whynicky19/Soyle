"""Deployment facts, deliberately empty until supplied by the operator."""
import os


def privacy_profile() -> dict:
    fields = {
        'operator_name': 'SOYLE_OPERATOR_NAME',
        'operator_country': 'SOYLE_OPERATOR_COUNTRY',
        'contact_email': 'SOYLE_PRIVACY_CONTACT_EMAIL',
        'hosting_location': 'SOYLE_HOSTING_LOCATION',
        'history_retention_policy': 'SOYLE_HISTORY_RETENTION_POLICY',
        'backup_retention_policy': 'SOYLE_BACKUP_RETENTION_POLICY',
        'deletion_request_policy': 'SOYLE_DELETION_REQUEST_POLICY',
    }
    values = {key: os.getenv(env, '').strip() or None for key, env in fields.items()}
    missing = [key for key, value in values.items() if not value]
    return {**values, 'status': 'mvp' if missing else 'operator_configured', 'missing': missing,
            'operator_configured': not missing, 'legal_review_verified': False,
            'processing': {
                'camera': 'browser_only_no_frames_uploaded', 'microphone_recording': False,
                'external_ai': False,
                'external_tts': 'azure_static_catalogue_only' if os.getenv('AZURE_TTS_ENABLED', 'false').lower() == 'true' else False, 'account_lifetime': 'until_parent_deletes_account',
                'deletion': 'active_database_immediate_after_password_confirmation',
                'backups': 'operator_policy_required',
            }}
