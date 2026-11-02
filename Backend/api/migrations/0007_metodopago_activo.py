from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [('api', '0006_configuracionsistema')]
    operations = [migrations.AddField(model_name='metodopago', name='activo', field=models.BooleanField(default=True))]
