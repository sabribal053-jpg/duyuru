require('dotenv').config();

const requiredEnvironment = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID'];
const missingEnvironment = requiredEnvironment.filter((name) => {
  const value = process.env[name]?.trim();
  return !value || value === 'your_token_here' || value === 'your_client_id_here' || value === 'your_guild_id_here';
});

if (missingEnvironment.length > 0) {
  console.error('❌ Eksik Discord ayarları: ' + missingEnvironment.join(', '));
  console.error('Komutları deploy etmeden önce .env dosyasını doldurun.');
  process.exit(1);
}

const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  commands.push(command.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('📝 Slash komutları kaydediliyor...');

    await rest.put(
      Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID),
      { body: commands }
    );

    console.log('✅ Slash komutları başarıyla kaydedildi!');
  } catch (error) {
    console.error('❌ Komut kaydedilirken hata oluştu:', error);
  }
})();
