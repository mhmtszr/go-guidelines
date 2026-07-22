/**
 * Go Guidelines plugin for OpenCode.ai
 *
 * Registers the skills directory so OpenCode discovers go-guidelines
 * without symlinks or manual config edits.
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillsDir = path.resolve(__dirname, '../../skills');
const goGuidelinesSkill = path.join(skillsDir, 'go-guidelines');

const GoGuidelinesPlugin = async () => {
  return {
    // Newer OpenCode skill registration (plugin return value)
    skill: [goGuidelinesSkill],

    // Compat with superpowers-style config.skills.paths mutation
    config: async (config) => {
      config.skills = config.skills || {};
      config.skills.paths = config.skills.paths || [];
      if (!config.skills.paths.includes(skillsDir)) {
        config.skills.paths.push(skillsDir);
      }
    },
  };
};

export { GoGuidelinesPlugin };
export default GoGuidelinesPlugin;
