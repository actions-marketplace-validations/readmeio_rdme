import nock from 'nock';
import prompts from 'prompts';

import UpdateVersionCommand from '../../../src/cmds/versions/update';
import APIError from '../../../src/lib/apiError';
import getAPIMock from '../../helpers/get-api-mock';

const key = 'API_KEY';
const version = '1.0.0';

const updateVersion = new UpdateVersionCommand();

describe('rdme versions:update', () => {
  beforeAll(() => nock.disableNetConnect());

  afterEach(() => nock.cleanAll());

  it('should prompt for login if no API key provided', async () => {
    const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();
    prompts.inject(['this-is-not-an-email', 'password', 'subdomain']);
    await expect(updateVersion.run({})).rejects.toStrictEqual(new Error('You must provide a valid email address.'));
    consoleInfoSpy.mockRestore();
  });

  it('should error in CI if no API key provided', async () => {
    process.env.TEST_RDME_CI = 'true';
    await expect(updateVersion.run({})).rejects.toStrictEqual(
      new Error('No project API key provided. Please use `--key`.')
    );
    delete process.env.TEST_RDME_CI;
  });

  it('should update a specific version object', async () => {
    const versionToChange = '1.1.0';
    const renamedVersion = '1.1.0-update';
    prompts.inject([versionToChange, renamedVersion, false, true, true, false]);

    const updatedVersionObject = {
      codename: '',
      version: renamedVersion,
      is_stable: false,
      is_beta: true,
      is_deprecated: false,
      is_hidden: false,
    };

    const mockRequest = getAPIMock()
      .get('/api/v1/version')
      .basicAuth({ user: key })
      .reply(200, [{ version }, { version: versionToChange }])
      .get(`/api/v1/version/${versionToChange}`)
      .basicAuth({ user: key })
      .reply(200, { version })
      .put(`/api/v1/version/${versionToChange}`, updatedVersionObject)
      .basicAuth({ user: key })
      .reply(201, updatedVersionObject);

    await expect(updateVersion.run({ key })).resolves.toBe(`Version ${versionToChange} updated successfully.`);
    mockRequest.done();
  });

  it('should update a specific version object using flags', async () => {
    const versionToChange = '1.1.0';
    const renamedVersion = '1.1.0-update';

    const updatedVersionObject = {
      codename: 'updated-test',
      version: renamedVersion,
      is_beta: true,
      is_hidden: false,
    };

    const mockRequest = getAPIMock()
      .get(`/api/v1/version/${versionToChange}`)
      .basicAuth({ user: key })
      .reply(200, { version: versionToChange })
      .get(`/api/v1/version/${versionToChange}`)
      .basicAuth({ user: key })
      .reply(200, { version: versionToChange })
      .put(`/api/v1/version/${versionToChange}`, updatedVersionObject)
      .basicAuth({ user: key })
      .reply(201, updatedVersionObject);

    await expect(
      updateVersion.run({
        key,
        version: versionToChange,
        newVersion: renamedVersion,
        beta: 'true',
        main: 'false',
        codename: 'updated-test',
        isPublic: 'true',
      })
    ).resolves.toBe(`Version ${versionToChange} updated successfully.`);
    mockRequest.done();
  });

  // Note: this test is a bit bizarre since the flag management
  // in our version commands is really confusing to follow.
  // I'm not sure if it's technically possible to demote a stable version
  // with our current prompt/flag management flow, but that's not
  // really the purpose of this test so I think it's fine as is.
  it('should catch any put request errors', async () => {
    const renamedVersion = '1.0.0-update';

    const updatedVersionObject = {
      codename: '',
      version: renamedVersion,
      is_beta: true,
      is_hidden: true,
    };

    prompts.inject([renamedVersion, true]);

    const errorResponse = {
      error: 'VERSION_CANT_DEMOTE_STABLE',
      message: "You can't make a stable version non-stable",
      suggestion: '...a suggestion to resolve the issue...',
      help: 'If you need help, email support@readme.io and mention log "fake-metrics-uuid".',
    };

    const mockRequest = getAPIMock()
      .get(`/api/v1/version/${version}`)
      .basicAuth({ user: key })
      .reply(200, { version })
      .get(`/api/v1/version/${version}`)
      .basicAuth({ user: key })
      .reply(200, { version })
      .put(`/api/v1/version/${version}`, updatedVersionObject)
      .basicAuth({ user: key })
      .reply(400, errorResponse);

    await expect(updateVersion.run({ key, version, main: 'false' })).rejects.toStrictEqual(new APIError(errorResponse));
    mockRequest.done();
  });
});
